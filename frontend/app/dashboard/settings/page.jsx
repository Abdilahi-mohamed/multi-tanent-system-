"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight, ClipboardCopy, ExternalLink, Link2, Palette,
  Share2, ShoppingBag, Store
} from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";
import { api } from "../../../lib/api";

export default function StoreSettingsPage() {
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    api("/auth/me")
      .then((result) => {
        setTenant(result.tenant);
        setError("");
      })
      .catch((reason) => setError(reason.message));
  }, []);

  const storeUrl = tenant?.slug
    ? `${typeof window === "undefined" ? "" : window.location.origin}/store/${encodeURIComponent(tenant.slug)}`
    : "";
  const shareText = `Visit ${tenant?.name || "our store"}: ${storeUrl}`;
  const encodedUrl = encodeURIComponent(storeUrl);

  async function copyStoreUrl() {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setShareMessage("Storefront link copied.");
    } catch {
      setShareMessage("Could not copy the link. Copy it from the URL shown above.");
    }
  }

  async function shareStorefront() {
    try {
      if (typeof navigator.share !== "function") {
        await copyStoreUrl();
        return;
      }
      await navigator.share({ title: tenant?.name || "Storefront", text: shareText, url: storeUrl });
      setShareMessage("Storefront shared.");
    } catch (reason) {
      if (reason.name !== "AbortError") setShareMessage("Could not open the sharing menu. Copy the link or choose a platform below.");
    }
  }

  return <div className="page-content">
    <PageHeader eyebrow="STOREFRONT" title="Storefront Management" description="Manage your public storefront, customer login branding, and sharing links." />
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="settings-grid storefront-management-grid">
      <Panel title="Storefront Management">
        <div className="setting-row"><Store /><div><b>Manage your storefront</b><p>Keep your catalog current and review the products and sections customers can browse in your public store.</p></div></div>
        <div className="storefront-card-actions">
          <a className="button subtle compact" href="/dashboard/products"><ShoppingBag size={13} /> Manage products</a>
          <a className="button subtle compact" href="/dashboard/sections"><Store size={13} /> Manage sections</a>
        </div>
      </Panel>

      <Panel title="Customer Login Page">
        <div className="setting-row"><Palette /><div><b>Customize your customer sign-in</b><p>Set your company logo, page colors, welcome message, form layout, and Google button style.</p></div></div>
        <div className="storefront-card-actions"><a className="button primary compact" href="/dashboard/login-page">Customize Login Page <ArrowUpRight size={13} /></a></div>
      </Panel>

      <Panel title="Share Storefront">
        <div className="setting-row"><Share2 /><div><b>Share your public store</b><p>Copy your link or share it on WhatsApp, Facebook, or another supported app.</p></div></div>
        {storeUrl && <a className="store-link-display" href={storeUrl} target="_blank" rel="noreferrer">{storeUrl}</a>}
        <div className="storefront-card-actions">
          <button className="button subtle compact" type="button" onClick={copyStoreUrl} disabled={!storeUrl}><ClipboardCopy size={13} /> Copy link</button>
          <a className="button subtle compact" href={storeUrl ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!storeUrl}><Share2 size={13} /> WhatsApp</a>
          <a className="button subtle compact" href={storeUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!storeUrl}><span className="facebook-share-icon" aria-hidden="true">f</span> Facebook</a>
          <button className="button subtle compact" type="button" onClick={shareStorefront} disabled={!storeUrl}><Link2 size={13} /> More</button>
        </div>
        {shareMessage && <p className="footnote" role="status">{shareMessage}</p>}
      </Panel>

      <Panel title="Public Storefront Link">
        <div className="setting-row"><ExternalLink /><div><b>Preview your live storefront</b><p>Open the tenant-specific storefront customers see, using your current public link.</p></div></div>
        {storeUrl && <a className="store-link-display" href={storeUrl} target="_blank" rel="noreferrer">{storeUrl}</a>}
        <div className="storefront-card-actions">
          <a className="button primary compact" href={storeUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!storeUrl}><ExternalLink size={13} /> Open public storefront</a>
        </div>
      </Panel>
    </div>
  </div>;
}
