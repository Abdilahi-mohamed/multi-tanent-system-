"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

export default function BootstrapAdminRegistrationPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, confirmPassword })
      });
      setCreated(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark">A</span><div><b>Aura Commerce</b><small>Multi-tenant business platform</small></div></div>
    <section className="login-card">
      <div className="login-icon"><ShieldCheck size={21} /></div>
      {created ? <>
        <h1>Super Admin created</h1>
        <p>Sign in with the username and password you just registered.</p>
        <Link className="button primary full-width register-login-link" href="/login">Go to sign in</Link>
      </> : <>
        <h1>Register Super Admin</h1>
        <p>Create a Super Admin account. Registration remains available; company accounts are managed from the Super Admin dashboard.</p>
        <form onSubmit={submit}>
          <label>Username<input required minLength="3" maxLength="32" pattern="(?:[A-Za-z0-9._]|-)+" autoComplete="username" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="platform.admin" /></label>
          <label>Password<input required type="password" minLength="6" maxLength="128" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
          <label>Confirm password<input required type="password" minLength="6" maxLength="128" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></label>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button primary full-width" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create Super Admin"}</button>
        </form>
        <div className="login-note"><KeyRound size={15} /> Public registration creates Super Admin accounts only. Company accounts must be created inside the Super Admin dashboard.</div>
      </>}
    </section>
  </main>;
}
