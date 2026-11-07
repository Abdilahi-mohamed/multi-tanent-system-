"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, apiUrl } from "../../../lib/api";
import { defaultLoginPageSettings } from "../../../lib/login-page";

export default function CustomerLoginPage() {
  const [mode, setMode] = useState("login");
  const [returnTo, setReturnTo] = useState("/customer/orders");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginPage, setLoginPage] = useState(defaultLoginPageSettings);
  const [tenantName, setTenantName] = useState("");
  const [customBranding, setCustomBranding] = useState(false);

  useEffect(() => {
    let active = true;
    const requestedPath = new URLSearchParams(window.location.search).get("returnTo");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")) {
      setReturnTo(requestedPath);
      const storePath = new URL(requestedPath, window.location.origin).pathname.match(/^\/store\/([^/]+)/);
      if (storePath) {
        api(`/store/${storePath[1]}/login-page`)
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
      const body = mode === "register" ? { name, email, password } : { email, password };
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
    window.location.assign(apiUrl(`/customer/auth/google?returnTo=${encodeURIComponent(returnTo)}`));
  }

  return <main className={`login-page ${customBranding ? `login-page-custom ${loginPage.layout} ${loginPage.formStyle}` : ""}`} style={pageStyle}>
    <Link href={returnTo} className="customer-auth-back">{returnTo.startsWith("/store/") ? "Back to store" : "Back"}</Link>
    {!customBranding && <Image className="login-brand-logo" src="/vendora-logo.png" alt="Vendora — Global Multi-Vendor SaaS Platform" width={555} height={375} priority />}
    {customBranding && loginPage.layout !== "split" && loginPage.logo && <img className="tenant-login-logo" src={loginPage.logo} alt={`${loginPage.companyName || tenantName} logo`} />}
    {customBranding && loginPage.layout === "split" && <div className="tenant-login-brand">{loginPage.logo && <img className="tenant-login-logo" src={loginPage.logo} alt={`${loginPage.companyName || tenantName} logo`} />}<h2>{loginPage.companyName || tenantName}</h2><p>{loginPage.welcomeMessage}</p></div>}
    <section className="login-card customer-login-card">
      {customBranding && <p className="tenant-login-company">{loginPage.companyName || tenantName}</p>}
      <h1>{mode === "register" ? "Create your customer account" : mode === "forgot" ? "Reset your password" : customBranding ? loginPage.heading : "Customer sign in"}</h1>
      <p>{customBranding ? loginPage.welcomeMessage : "Sign in to view this store’s products, place orders, and track your purchases."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Full name<input autoComplete="name" required minLength="2" maxLength="120" value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength="72" value={password} onChange={(event) => setPassword(event.target.value)} />{mode === "register" && <small>Use 12 to 72 characters.</small>}</label>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {message && <div className="customer-auth-message" role="status">{message}</div>}
        <button className="button primary full-width tenant-login-primary" type="submit" disabled={busy} style={customBranding ? { background: loginPage.primaryColor, borderColor: loginPage.primaryColor, color: "#fff" } : undefined}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      {mode !== "forgot" && <button className={`google-signin-button ${customBranding ? `tenant-google-${loginPage.googleButtonStyle}` : ""}`} type="button" onClick={signInWithGoogle}><span aria-hidden="true">G</span> Continue with Google</button>}
      <div className="customer-login-links">
        {mode === "login" && <button className="text-link" type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}
        <button className="text-link" type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); setMessage(""); }}>{mode === "register" ? "Already registered? Sign in" : "Create an account"}</button>
      </div>
      <p className="customer-auth-privacy">Your orders and account details are private to your customer account.</p>
    </section>
    {customBranding && <span className="tenant-login-background-company">{tenantName}</span>}
  </main>;
}
