"use client";

import { useEffect, useState } from "react";
import { Globe2, Store, ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";
import { api } from "../../../lib/api";

export default function StoreSettingsPage() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
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
      <Panel title="Your storefront"><div className="setting-row"><Store /><div><b>Public store link</b><p>Share this link with customers. They must sign in to view products and place orders.</p></div></div>{error && <p className="footnote" role="alert">{error}</p>}{slug && <a className="store-link-display" href={storeUrl} target="_blank" rel="noreferrer">{storeUrl}</a>}</Panel>
      <Panel title="Tenant isolation"><div className="setting-row"><ShieldCheck /><div><b>Business-owned records</b><p>Product, order, and customer operations use the authenticated business membership on the server.</p></div></div></Panel>
      <Panel title="Custom domain"><div className="setting-row"><Globe2 /><div><b>Custom domains</b><p>Domain ownership, DNS verification, and SSL provisioning are not configured in this release.</p></div><span className="status-pill pending">Unavailable</span></div></Panel>
    </div>
  </div>;
}
