"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, apiUrl } from "../../../lib/api";

export default function CustomerLoginPage() {
  const [mode, setMode] = useState("login");
  const [returnTo, setReturnTo] = useState("/customer/orders");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const requestedPath = new URLSearchParams(window.location.search).get("returnTo");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")) {
      setReturnTo(requestedPath);
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
  }, []);

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

  return <main className="login-page">
    <Link href={returnTo} className="customer-auth-back">{returnTo.startsWith("/store/") ? "Back to store" : "Back"}</Link>
    <Image className="login-brand-logo" src="/vendora-logo.png" alt="Vendora — Global Multi-Vendor SaaS Platform" width={555} height={375} priority />
    <section className="login-card customer-login-card">
      <h1>{mode === "register" ? "Create your customer account" : mode === "forgot" ? "Reset your password" : "Customer sign in"}</h1>
      <p>Sign in to view this store’s products, place orders, and track your purchases.</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Full name<input autoComplete="name" required minLength="2" maxLength="120" value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength="72" value={password} onChange={(event) => setPassword(event.target.value)} />{mode === "register" && <small>Use 12 to 72 characters.</small>}</label>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {message && <div className="customer-auth-message" role="status">{message}</div>}
        <button className="button primary full-width" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      {mode !== "forgot" && <button className="google-signin-button" type="button" onClick={signInWithGoogle}><span aria-hidden="true">G</span> Continue with Google</button>}
      <div className="customer-login-links">
        {mode === "login" && <button className="text-link" type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}
        <button className="text-link" type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); setMessage(""); }}>{mode === "register" ? "Already registered? Sign in" : "Create an account"}</button>
      </div>
      <p className="customer-auth-privacy">Your orders and account details are private to your customer account.</p>
    </section>
  </main>;
}
