"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LockKeyhole, Store } from "lucide-react";
import { api, setToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ identifier: username, password }) });
      setToken(result.token);
      router.replace(result.user.role === "super_admin" ? "/super-admin/overview" : "/dashboard");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <Image className="login-brand-logo" src="/vendora-logo.png" alt="Vendora — Global Multi-Vendor SaaS Platform" width={555} height={375} priority />
    <section className="login-card">
      <div className="login-icon"><LockKeyhole size={21} /></div>
      <h1>Welcome back</h1>
      <p>Sign in to your secure workspace.</p>
      <form onSubmit={submit}>
        <label>Username or email<input type="text" autoComplete="username" autoCapitalize="none" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username or email" /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
        {error && <div className="inline-error">{error}</div>}
        <button className="button primary full-width" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="login-note"><Store size={15} /> One sign-in automatically opens your platform or company dashboard.</div>
      <p className="register-signin-link">First-time setup? <Link href="/register">Register Super Admin</Link></p>
    </section>
  </main>;
}
