"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function ResetCustomerPasswordPage() {
  const [token, setToken] = useState("");
  const [returnTo, setReturnTo] = useState("/customer/orders");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setToken(query.get("token") || "");
    const requestedPath = query.get("returnTo");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")) {
      setReturnTo(requestedPath);
    }
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/customer/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword })
      });
      setMessage(result.message);
      setPassword("");
      setConfirmPassword("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <Image className="login-brand-logo" src="/vendora-brand-logo.png" alt="Vendora — Global Multi-Vendor SaaS Platform" width={512} height={256} priority />
    <section className="login-card customer-login-card">
      <h1>Choose a new password</h1>
      <p>Reset links expire one hour after they are sent.</p>
      {!token ? <div className="inline-error" role="alert">This reset link is invalid or missing.</div> : <form onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" required minLength="12" maxLength="72" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength="12" maxLength="72" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {message && <div className="customer-auth-message" role="status">{message}</div>}
        <button className="button primary full-width" type="submit" disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
      </form>}
      {message && <Link className="button subtle full-width" href={`/customer/login?returnTo=${encodeURIComponent(returnTo)}`}>Go to sign in</Link>}
    </section>
  </main>;
}
