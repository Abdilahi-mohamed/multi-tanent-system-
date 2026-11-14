"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, apiUrl } from "../lib/api";
import { defaultLoginPageSettings } from "../lib/login-page";

export default function CustomerLoginForm() {
  const [mode, setMode] = useState("login");
  const [returnTo, setReturnTo] = useState("/customer/orders");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginPage, setLoginPage] = useState(defaultLoginPageSettings);
  const [tenantName, setTenantName] = useState("");
  const [customBranding, setCustomBranding] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    let active = true;
    const requestedPath = new URLSearchParams(window.location.search).get("returnTo");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")) {
      setReturnTo(requestedPath);
      const storePath = new URL(requestedPath, window.location.origin).pathname.match(/^\/store\/([^/]+)/);
      if (storePath) {
        api(`/store/${encodeURIComponent(storePath[1])}/login-page`)
          .then((result) => {
            if (!active) return;
            setTenantName(result.tenant.name);
            setLoginPage({ ...defaultLoginPageSettings, ...result.loginPage });
            setCustomBranding(result.isPublished);
          })
          .catch((reason) => { if (active && reason.status !== 404) setError(reason.message); });
      }
      const returnUrl = new URL(requestedPath, window.location.origin);
      const googleError = returnUrl.searchParams.get("customerAuthError");
      if (googleError === "google_not_configured") {
        setError("Google sign-in is not configured for this store yet.");
      } else if (googleError === "google_account_conflict") {
        setError("This Google account conflicts with an existing customer account. Sign in with email or contact support.");
      } else if (googleError === "customer_unavailable") {
        setError("This customer account is unavailable. Contact support for help.");
      } else if (googleError === "google_configuration_mismatch") {
        setError("Google sign-in is misconfigured. Contact the store administrator.");
      } else if (googleError) {
        setError("Google sign-in could not be completed. Please try again.");
      }
    }
    return () => { active = false; };
  }, []);

  const pageStyle = customBranding ? {
    backgroundColor: loginPage.backgroundColor,
    ...(loginPage.backgroundImage ? {
      backgroundImage: `linear-gradient(rgba(0,0,0,.42), rgba(0,0,0,.42)), url("${loginPage.backgroundImage}")`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    } : {}),
    "--login-primary": loginPage.primaryColor,
    "--login-secondary": loginPage.secondaryColor
  } : undefined;

  async function submit(event) {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "forgot") {
        const result = await api("/customer/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email, returnTo })
        });
        setMessage(result.message);
        return;
      }
      const path = mode === "register" ? "/customer/auth/register" : "/customer/auth/login";
      const body = mode === "register"
        ? { name, email, password, rememberMe }
        : { email, password, rememberMe };
      await api(path, { method: "POST", body: JSON.stringify(body) });
      const destination = new URL(returnTo, window.location.origin);
      destination.searchParams.delete("customerAuthError");
      window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  function signInWithGoogle() {
    if (!googleClientId) {
      setError("Google sign-in is not configured for this store yet.");
      return;
    }
    window.location.assign(apiUrl(`/customer/auth/google?clientId=${encodeURIComponent(googleClientId)}&returnTo=${encodeURIComponent(returnTo)}&rememberMe=${rememberMe}`));
  }

  return <main className={`login-page ${customBranding ? `login-page-custom ${loginPage.layout} ${loginPage.formStyle}` : ""}`} style={pageStyle}>
    {!returnTo.startsWith("/store/") && <Link href={returnTo} className="customer-auth-back">Back</Link>}
    {!customBranding && <Image className="login-brand-logo" src="/vendora-brand-logo.png" alt="Vendora — Global Multi-Vendor SaaS Platform" width={512} height={256} priority />}
    {customBranding && loginPage.layout !== "split" && loginPage.logo && <img className="tenant-login-logo" src={loginPage.logo} alt={`${loginPage.companyName || tenantName} logo`} />}
    {customBranding && loginPage.layout === "split" && <div className="tenant-login-brand">{loginPage.logo && <img className="tenant-login-logo" src={loginPage.logo} alt={`${loginPage.companyName || tenantName} logo`} />}<h2>{loginPage.companyName || tenantName}</h2><p>{loginPage.welcomeMessage}</p></div>}
    <section className="login-card customer-login-card">
      {customBranding && <p className="tenant-login-company">{loginPage.companyName || tenantName}</p>}
      <h1>{mode === "register" ? "Create your customer account" : mode === "forgot" ? "Reset your password" : customBranding ? loginPage.heading : "Customer sign in"}</h1>
      <p>{customBranding ? loginPage.welcomeMessage : "Sign in to place orders and track your purchases."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Full Name<input autoComplete="name" required minLength="2" maxLength="120" value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email Address<input type="email" autoComplete="email" required maxLength="254" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode !== "forgot" && <label>Password<span className="customer-password-control"><input type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength="72" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="customer-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>{mode === "register" && <small>Use 12 to 72 characters.</small>}</label>}
        {mode === "register" && <label>Confirm Password<span className="customer-password-control"><input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" required minLength="12" maxLength="72" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><button className="customer-password-toggle" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>}
        {mode !== "forgot" && <label className="remember-me-option"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Remember me</label>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {message && <div className="customer-auth-message" role="status">{message}</div>}
        <button className="button primary full-width tenant-login-primary" type="submit" disabled={busy} style={customBranding ? { background: loginPage.primaryColor, borderColor: loginPage.primaryColor, color: "#fff" } : undefined}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      {mode !== "forgot" && <>
        <div className="customer-auth-divider" aria-hidden="true"><span>OR</span></div>
        <button className={`google-signin-button ${customBranding ? `tenant-google-${loginPage.googleButtonStyle}` : ""}`} type="button" onClick={signInWithGoogle}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M23.49 12.27c0-.78-.07-1.53-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.61v2.93h3.87c2.27-2.09 3.57-5.17 3.57-8.78Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.95l-3.87-2.93c-1.08.72-2.46 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.02A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.25 14.3A7.2 7.2 0 0 1 4.88 12c0-.8.14-1.57.37-2.3V6.68H1.25A12 12 0 0 0 0 12c0 1.94.46 3.78 1.25 5.32l4-3.02Z" />
            <path fill="#EA4335" d="M12 4.73c1.77 0 3.36.61 4.61 1.81l3.45-3.45C17.95 1.14 15.24 0 12 0A12 12 0 0 0 1.25 6.68l4 3.02C6.2 6.85 8.86 4.73 12 4.73Z" />
          </svg>
          Continue with Google
        </button>
      </>}
      <div className="customer-login-links">
        {mode === "login" && <button className="text-link" type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}
        <button className="text-link" type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); setMessage(""); }}>{mode === "register" ? "Already registered? Sign in" : "Create an account"}</button>
      </div>
      <p className="customer-auth-privacy">Your customer account cannot access company or platform dashboards.</p>
    </section>
    {customBranding && <span className="tenant-login-background-company">{tenantName}</span>}
  </main>;
}