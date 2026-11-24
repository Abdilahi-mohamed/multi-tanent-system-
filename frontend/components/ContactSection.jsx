"use client";

import { useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import { SiGmail, SiGithub, SiWhatsapp } from "react-icons/si";
import { ArrowRight, Mail, MapPin, Send } from "lucide-react";
import { api } from "../lib/api";

const profiles = [
  { label: "Email", icon: SiGmail, href: "mailto:abdilahimohamed459@gmail.com" },
  { label: "WhatsApp", icon: SiWhatsapp, href: "https://wa.me/252634594307?s=p" },
  { label: "LinkedIn", icon: FaLinkedin, href: "https://www.linkedin.com/in/abdilahi-mohamed-564317393" },
  { label: "GitHub", icon: SiGithub, href: "https://github.com/Abdilahi-mohamed" }
];

export default function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validate() {
    const next = {};
    if (form.name.trim().length < 2) next.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.subject.trim().length < 2) next.subject = "Enter a subject.";
    if (form.message.trim().length < 10) next.message = "Enter at least 10 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setNotice("");
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await api("/contact/message", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setNotice(result.message);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (reason) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="personal-contact-section" id="contact">
      <div className="personal-contact-layout section-wrap">
        <div className="personal-contact-copy">
          <span className="section-kicker">LET'S WORK TOGETHER</span>
          <h2>Contact <span>Me</span></h2>
          <p>Have a project, a product idea, or a question? Send a message and choose the channel that works best for you.</p>

          <div className="personal-contact-list">
            <a href="mailto:abdilahimohamed459@gmail.com">
              <span><Mail size={17} /></span>
              <div><small>Email address</small><b>abdilahimohamed459@gmail.com</b></div>
            </a>
            <a href="https://wa.me/252634594307?s=p" target="_blank" rel="noreferrer">
              <span><SiWhatsapp size={17} /></span>
              <div><small>WhatsApp</small><b>+252 634594307</b></div>
            </a>
          </div>

          <div className="personal-social-profiles" aria-label="Abdilahi Mohamed social profiles">
            {profiles.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
                aria-label={label}
                title={label}
              >
                <Icon />
              </a>
            ))}
          </div>
        </div>

        <form className="personal-contact-form" onSubmit={submit} noValidate>
          <div className="personal-contact-form-heading">
            <span><Send size={18} /></span>
            <div><small>SEND A MESSAGE</small><h3>Tell me what you need</h3></div>
          </div>
          <div className="personal-contact-grid">
            <label>Your Name<input value={form.name} onChange={(event) => update("name", event.target.value)} maxLength={120} autoComplete="name" placeholder="Full name" aria-invalid={Boolean(errors.name)} /></label>
            <label>Email Address<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} maxLength={254} autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} /></label>
          </div>
          {errors.name && <p className="personal-field-error">{errors.name}</p>}
          {errors.email && <p className="personal-field-error">{errors.email}</p>}
          <label>Subject<input value={form.subject} onChange={(event) => update("subject", event.target.value)} maxLength={160} placeholder="What would you like to discuss?" aria-invalid={Boolean(errors.subject)} /></label>
          {errors.subject && <p className="personal-field-error">{errors.subject}</p>}
          <label>Message<textarea value={form.message} onChange={(event) => update("message", event.target.value)} maxLength={3000} rows={5} placeholder="Share a few details..." aria-invalid={Boolean(errors.message)} /></label>
          {errors.message && <p className="personal-field-error">{errors.message}</p>}
          {notice && <div className="personal-contact-notice" role="status">{notice}</div>}
          <button type="submit" disabled={busy}>{busy ? "Sending..." : "Send Message"}<ArrowRight size={16} /></button>
        </form>
      </div>
    </section>
  );
}
