"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Monitor, RotateCcw, Save, Smartphone, X } from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";
import { api } from "../../../lib/api";
import { defaultLoginPageSettings } from "../../../lib/login-page";

const imageLimit = 256 * 1024;

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(file, maxDimension) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= imageLimit && ["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
      return readAsDataUrl(blob);
    }
  }
  throw new Error("This image is still too large. Choose a smaller image and try again.");
}

function LoginPreview({ settings, tenantName }) {
  const companyName = settings.companyName || tenantName || "Your store";
  const background = settings.backgroundImage
    ? `linear-gradient(rgba(0,0,0,.42), rgba(0,0,0,.42)), url("${settings.backgroundImage}")`
    : undefined;
  const style = {
    backgroundColor: settings.backgroundColor,
    ...(background ? { backgroundImage: background, backgroundSize: "cover", backgroundPosition: "center" } : {}),
    "--login-primary": settings.primaryColor,
    "--login-secondary": settings.secondaryColor
  };
  return <div className={`login-page-preview ${settings.layout} ${settings.formStyle}`} style={style}>
    {settings.layout === "split" && <div className="login-preview-branding"><div>{settings.logo && <img className="login-preview-logo" src={settings.logo} alt={`${companyName} logo`} />}<b>{companyName}</b><p>{settings.welcomeMessage}</p></div></div>}
    <section className="login-preview-card">
      {settings.layout !== "split" && <div className="login-preview-company">{settings.logo && <img className="login-preview-logo" src={settings.logo} alt={`${companyName} logo`} />}<b>{companyName}</b></div>}
      <h2>{settings.heading}</h2><p>{settings.welcomeMessage}</p>
      <label>Email address<input disabled placeholder="you@example.com" /></label>
      <label>Password<input disabled type="password" placeholder="Enter your password" /></label>
      <button className="login-preview-primary" type="button">Sign in</button>
      <div className={`login-preview-google ${settings.googleButtonStyle}`}><b>G</b> Continue with Google</div>
      <small>New here? Create a customer account</small>
    </section>
  </div>;
}

export default function LoginPageCustomizer() {
  const [settings, setSettings] = useState(defaultLoginPageSettings);
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api("/auth/me"), api("/tenant/storefront-login")])
      .then(([auth, saved]) => {
        setTenantName(auth.tenant?.name || "");
        setSlug(auth.tenant?.slug || "");
        setSettings({ ...defaultLoginPageSettings, ...saved.draft });
        setPublished(saved.isPublished);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function upload(field, file) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      update(field, await prepareImage(file, field === "logo" ? 640 : 1600));
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/tenant/storefront-login", { method: "PATCH", body: JSON.stringify(settings) });
      setSettings({ ...defaultLoginPageSettings, ...result.draft });
      await api("/tenant/storefront-login/publish", { method: "POST", body: JSON.stringify({}) });
      setPublished(true);
      setMessage("Changes saved and published. Your customers can see the updated login page.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Reset the login page to the default design and unpublish the current customization?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/tenant/storefront-login/reset", { method: "POST", body: JSON.stringify({}) });
      setSettings({ ...defaultLoginPageSettings, ...result.draft });
      setPublished(false);
      setMessage("Login page reset to the default design. The customized page is no longer published.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page-content"><p className="empty-state">Loading your login page settings…</p></div>;

  return <div className="page-content">
    <PageHeader eyebrow="STOREFRONT" title="Customize Login Page" description="Create a branded sign-in experience for customers. Save your changes to publish them to your storefront login page." actions={<span className={`status-pill ${published ? "active" : "pending"}`}>{published ? "Published" : "Draft"}</span>} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {message && <p className="customer-auth-message" role="status">{message}</p>}
    <div className="login-customizer-layout">
      <div className="stack">
        <Panel title="Brand and content">
          <div className="login-customizer-fields">
            <label>Company name<input maxLength="100" value={settings.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder={tenantName} /></label>
            <label>Login heading<input required maxLength="100" value={settings.heading} onChange={(event) => update("heading", event.target.value)} /></label>
            <label className="wide-field">Welcome message<textarea rows="3" maxLength="240" value={settings.welcomeMessage} onChange={(event) => update("welcomeMessage", event.target.value)} /></label>
            <label className="login-image-upload"><span>Company logo</span><span className="login-image-control">{settings.logo ? <img src={settings.logo} alt="Current company logo" /> : <ImagePlus size={20} />}<span>{settings.logo ? "Change logo" : "Upload logo"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload("logo", event.target.files?.[0])} /></span></label>
            <label className="login-image-upload"><span>Background image</span><span className="login-image-control">{settings.backgroundImage ? <img src={settings.backgroundImage} alt="Current login background" /> : <ImagePlus size={20} />}<span>{settings.backgroundImage ? "Change background" : "Upload background"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload("backgroundImage", event.target.files?.[0])} /></span>{settings.backgroundImage && <button className="text-link" type="button" onClick={() => update("backgroundImage", "")}>Remove image</button>}</label>
          </div>
        </Panel>
        <Panel title="Colors and style">
          <div className="login-customizer-fields">
            <label>Background color<input className="login-color-input" type="color" value={settings.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} /></label>
            <label>Primary color<input className="login-color-input" type="color" value={settings.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /></label>
            <label>Secondary color<input className="login-color-input" type="color" value={settings.secondaryColor} onChange={(event) => update("secondaryColor", event.target.value)} /></label>
            <label>Page layout<select value={settings.layout} onChange={(event) => update("layout", event.target.value)}><option value="centered">Centered</option><option value="split">Split branding</option></select></label>
            <label>Login form style<select value={settings.formStyle} onChange={(event) => update("formStyle", event.target.value)}><option value="card">Card</option><option value="minimal">Minimal</option></select></label>
            <label>Google button style<select value={settings.googleButtonStyle} onChange={(event) => update("googleButtonStyle", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
          </div>
          <div className="login-customizer-actions">
            <button type="button" className="button subtle compact" onClick={() => setPreviewOpen(true)}><Monitor size={14} /> Preview Login Page</button>
            <button type="button" className="button primary compact" onClick={save} disabled={busy}><Save size={14} /> {busy ? "Saving & publishing…" : "Save & Publish"}</button>
            <button type="button" className="button subtle compact" onClick={reset} disabled={busy}><RotateCcw size={14} /> Reset to Default</button>
          </div>
          {slug && <a className="text-link login-preview-store-link" href={`/login?returnTo=${encodeURIComponent(`/store/${slug}`)}`} target="_blank" rel="noreferrer"><Smartphone size={13} /> Open the customer login page</a>}
        </Panel>
      </div>
      <Panel title="Live preview" className="login-live-preview-panel"><p className="payment-section-note">Preview updates as you make changes. Save &amp; Publish to make the latest design visible to customers.</p><LoginPreview settings={settings} tenantName={tenantName} /></Panel>
    </div>
    {previewOpen && <div className="login-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><section className="login-preview-modal" role="dialog" aria-modal="true" aria-label="Login page preview"><button type="button" className="icon-button login-preview-close" aria-label="Close preview" onClick={() => setPreviewOpen(false)}><X size={16} /></button><LoginPreview settings={settings} tenantName={tenantName} /></section></div>}
  </div>;
}
