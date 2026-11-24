"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, ChevronDown, CreditCard, Eye, EyeOff, LockKeyhole,
  Phone, ShieldCheck, Store, UserRound, WalletCards
} from "lucide-react";
import { api } from "../../lib/api";
import "../landing.css";
import "./register-company.css";

const providers = [
  { id: "zaad", name: "ZAAD", mark: "Z", detail: "Mobile money" },
  { id: "edahab", name: "eDahab", mark: "e", detail: "Mobile money" },
  { id: "bank_transfer", name: "Bank Transfer", mark: "BT", detail: "Bank account" },
  { id: "golis", name: "Golis", mark: "G", detail: "Mobile money" },
  { id: "hormuud", name: "Hormuud", mark: "H", detail: "Mobile money" }
];

const securePasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}$/;

export default function CompanyRegistrationPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "", email: "", companyName: "", username: "",
    password: "", confirmPassword: "", paymentProvider: "",
    senderAccount: "", acceptedTerms: false
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedProvider = providers.find((provider) => provider.id === form.paymentProvider);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validate() {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.companyName.trim().length < 2) next.companyName = "Enter your company name.";
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(form.username)) next.username = "Use 3–32 letters, numbers, dots, underscores, or hyphens.";
    if (!securePasswordPattern.test(form.password)) next.password = "Use 12+ characters with uppercase, lowercase, and a number.";
    if (form.password !== form.confirmPassword) next.confirmPassword = "Passwords do not match.";
    if (!selectedProvider) next.paymentProvider = "Select a payment provider.";
    if (form.senderAccount.trim().length < 6) {
      next.senderAccount = form.paymentProvider === "bank_transfer"
        ? "Enter a valid bank account number."
        : "Enter a valid payment phone number.";
    } else if (form.paymentProvider === "bank_transfer" && !/^[A-Za-z0-9 -]{6,64}$/.test(form.senderAccount.trim())) {
      next.senderAccount = "Enter a valid bank account number.";
    } else if (form.paymentProvider && form.paymentProvider !== "bank_transfer" && !/^\+?[0-9]{7,15}$/.test(form.senderAccount.trim())) {
      next.senderAccount = "Enter a valid phone number with 7–15 digits.";
    }
    if (!form.acceptedTerms) next.acceptedTerms = "Accept the Terms & Conditions to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setNotice("");
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await api("/auth/company/register", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setNotice(`${result.message} Reference: ${result.registrationReference}`);
      window.setTimeout(() => router.push("/login"), 3200);
    } catch (reason) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="company-registration landing-page">
      <header className="registration-header">
        <Link className="landing-brand" href="/" aria-label="Vendora home">
          <Image src="/vendora-brand-mark.png" alt="" width={40} height={40} />
          <span><strong>vendora</strong><small>BUSINESS, IN MOTION</small></span>
        </Link>
        <Link className="registration-back" href="/"><ArrowLeft size={16} /> Back to Vendora</Link>
      </header>

      <div className="registration-shell">
        <aside className="registration-aside">
          <span className="section-kicker">COMPANY WORKSPACE</span>
          <h1>Create your<br />Vendora account.</h1>
          <p>Submit your company details for Super Admin review and payment verification.</p>
          <div className="registration-steps">
            <div className="active"><span><UserRound size={17} /></span><div><b>Company details</b><small>Account and business information</small></div><Check size={14} /></div>
            <div><span><WalletCards size={17} /></span><div><b>Payment verification</b><small>Securely recorded for review</small></div></div>
            <div><span><ShieldCheck size={17} /></span><div><b>Account approval</b><small>Activated after verification</small></div></div>
          </div>
          <div className="registration-security"><LockKeyhole size={16} /><span><b>Secure registration</b><small>Your password is hashed and account data remains protected.</small></span></div>
        </aside>

        <section className="registration-form-card">
          <form onSubmit={submit} noValidate>
            <div className="registration-form-heading">
              <span><Store size={19} /></span>
              <div><small>NEW COMPANY</small><h2>Registration details</h2></div>
            </div>

            <fieldset>
              <legend>Company &amp; Account Information</legend>
              <div className="registration-grid">
                <label>Full Name<input value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" maxLength={120} placeholder="Your full name" aria-invalid={Boolean(errors.fullName)} /></label>
                <label>Email Address<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" maxLength={254} placeholder="name@company.com" aria-invalid={Boolean(errors.email)} /></label>
                <label>Company Name<input value={form.companyName} onChange={(event) => update("companyName", event.target.value)} autoComplete="organization" maxLength={120} placeholder="Company name" aria-invalid={Boolean(errors.companyName)} /></label>
                <label>Username<input value={form.username} onChange={(event) => update("username", event.target.value)} autoComplete="username" autoCapitalize="none" maxLength={32} placeholder="company.owner" aria-invalid={Boolean(errors.username)} /></label>
                <label>Password<span className="password-input"><input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" maxLength={128} placeholder="At least 12 characters" aria-invalid={Boolean(errors.password)} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
                <label>Confirm Password<input type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} autoComplete="new-password" maxLength={128} placeholder="Re-enter password" aria-invalid={Boolean(errors.confirmPassword)} /></label>
              </div>
              {Object.entries(errors).filter(([key]) => ["fullName", "email", "companyName", "username", "password", "confirmPassword"].includes(key)).map(([key, message]) => <p className="field-error" key={key}>{message}</p>)}
            </fieldset>

            <fieldset className="payment-fieldset">
              <legend><span>Payment Information</span><small>Recorded securely; no automatic activation</small></legend>
              <div className="registration-grid payment-grid">
                <label>Payment Provider<span className="select-input"><select value={form.paymentProvider} onChange={(event) => { update("paymentProvider", event.target.value); update("senderAccount", ""); }} aria-invalid={Boolean(errors.paymentProvider)}><option value="">Select a provider</option>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select><ChevronDown size={15} /></span></label>
                <label>{form.paymentProvider === "bank_transfer" ? "Sender Account Number" : "Sender Phone Number"}<span className="account-input">{form.paymentProvider === "bank_transfer" ? <CreditCard size={16} /> : <Phone size={16} />}<input value={form.senderAccount} onChange={(event) => update("senderAccount", event.target.value)} inputMode={form.paymentProvider === "bank_transfer" ? "text" : "tel"} maxLength={64} placeholder={form.paymentProvider === "bank_transfer" ? "Enter bank account number" : "e.g. +252612345678"} aria-invalid={Boolean(errors.senderAccount)} /></span></label>
              </div>

              {selectedProvider && <div className="provider-preview"><span className={`provider-mark provider-${selectedProvider.id}`}>{selectedProvider.mark}</span><div><b>{selectedProvider.name}</b><small>{selectedProvider.detail} · Secure payment review</small></div><ShieldCheck size={17} /></div>}
              {errors.paymentProvider && <p className="field-error">{errors.paymentProvider}</p>}
              {errors.senderAccount && <p className="field-error">{errors.senderAccount}</p>}
              <div className="payment-pending-note"><WalletCards size={16} /><p><b>Payment verification is pending</b><span>No payment success is assumed by this form. A platform administrator must verify payment and approval.</span></p></div>
            </fieldset>

            <label className="terms-option"><input type="checkbox" checked={form.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} /><span>I accept the <Link href="/login">Terms &amp; Conditions</Link> and understand that my account requires approval.</span></label>
            {errors.acceptedTerms && <p className="field-error">{errors.acceptedTerms}</p>}
            {notice && <div className={`registration-notice ${notice.toLowerCase().includes("pending") ? "success" : "error"}`} role="status">{notice}</div>}
            <button className="registration-submit" type="submit" disabled={busy}>{busy ? "Creating company account…" : "Create Company Account"}<ArrowLeft size={16} /></button>
          </form>
        </section>
      </div>
    </main>
  );
}
