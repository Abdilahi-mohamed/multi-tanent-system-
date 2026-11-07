"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, ExternalLink, Globe2, Palette, Share2, Store, ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";
import { api } from "../../../lib/api";

export default function StoreSettingsPage() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    api("/auth/me").then((result) => {
      const currentSlug = result.tenant?.slug || "";
      setSlug(currentSlug);
      if (currentSlug) setStoreUrl(`${window.location.origin}/store/${encodeURIComponent(currentSlug)}`);
    }).catch((reason) => setError(reason.message));
  }, []);
  return <div className="page-content">
    <PageHeader eyebrow="STOREFRONT & SETTINGS" title="Store settings" description="Tenant settings and public storefront status." />
    <div className="settings-grid">
      <Panel title="Storefront management"><div className="setting-row"><Store /><div><b>Public storefront link</b><p>Anyone can browse your published products. Customers sign in when they are ready to place an order.</p></div></div>{error && <p className="footnote" role="alert">{error}</p>}{slug && <><a className="store-link-display" href={storeUrl} target="_blank" rel="noreferrer">{storeUrl}</a><div className="store-link-actions" id="storefront-share"><a className="button subtle compact" href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open storefront</a><button className="button subtle compact" type="button" onClick={async () => { try { await navigator.clipboard.writeText(storeUrl); setShareMessage("Storefront link copied."); } catch { setShareMessage("Could not copy the link. Copy it from the link above."); } }}><ClipboardCopy size={13} /> Copy link</button><a className="button subtle compact" href={`https://wa.me/?text=${encodeURIComponent(`Visit ${storeUrl}`)}`} target="_blank" rel="noreferrer"><Share2 size={13} /> Share on WhatsApp</a></div>{shareMessage && <p className="footnote" role="status">{shareMessage}</p>}</>}</Panel>
      <Panel title="Customer login page"><div className="setting-row"><Palette /><div><b>Customize Login Page</b><p>Brand your customer sign-in page with your logo, colors, welcome message, and layout.</p></div></div><a className="button primary compact" href="/dashboard/login-page">Customize Login Page</a></Panel>
      <Panel title="Tenant isolation"><div className="setting-row"><ShieldCheck /><div><b>Business-owned records</b><p>Product, order, and customer operations use the authenticated business membership on the server.</p></div></div></Panel>
      <Panel title="Custom domain"><div className="setting-row"><Globe2 /><div><b>Custom domains</b><p>Domain ownership, DNS verification, and SSL provisioning are not configured in this release.</p></div><span className="status-pill pending">Unavailable</span></div></Panel>
    </div>
  </div>;
}
