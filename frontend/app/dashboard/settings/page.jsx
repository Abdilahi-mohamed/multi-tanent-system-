"use client";

import { useEffect, useState } from "react";
import { Globe2, Store, ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";
import { api } from "../../../lib/api";

export default function StoreSettingsPage() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api("/auth/me").then((result) => setSlug(result.tenant?.slug || "")).catch((reason) => setError(reason.message));
  }, []);
  return <div className="page-content">
    <PageHeader eyebrow="STOREFRONT & SETTINGS" title="Store settings" description="Tenant settings and public storefront status." />
    <div className="settings-grid">
      <Panel title="Your storefront"><div className="setting-row"><Store /><div><b>Public store route</b><p>Each active business has an isolated catalog and order flow.</p></div></div>{error && <p className="footnote">{error}</p>}{slug && <a className="button subtle" href={`/store/${slug}`} target="_blank" rel="noreferrer">Open your storefront ↗</a>}</Panel>
      <Panel title="Tenant isolation"><div className="setting-row"><ShieldCheck /><div><b>Business-owned records</b><p>Product, order, and customer operations use the authenticated business membership on the server.</p></div></div></Panel>
      <Panel title="Custom domain"><div className="setting-row"><Globe2 /><div><b>Custom domains</b><p>Domain ownership, DNS verification, and SSL provisioning are not configured in this release.</p></div><span className="status-pill pending">Unavailable</span></div></Panel>
    </div>
  </div>;
}
