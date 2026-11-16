"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Bell, Building2, CreditCard, Database, RefreshCw, ShieldCheck, Users, Wallet
} from "lucide-react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/AppShell";

const initialSummary = { pendingBusinesses: null, accounts: null, pendingPayments: null };

export default function PlatformSettingsPage() {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overview, users, payments] = await Promise.all([
        api("/admin/overview"),
        api("/admin/users?role=business_owner&page=1&limit=1"),
        api("/admin/payments?page=1&limit=1")
      ]);
      setSummary({
        pendingBusinesses: overview.metrics.pendingBusinesses,
        accounts: users.summary.companyUserCount + users.summary.platformAdminCount,
        pendingPayments: payments.metrics.pending
      });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const cards = [
    {
      icon: Building2,
      category: "Onboarding",
      title: "Business registrations",
      status: "Manual review",
      statusTone: "review",
      description: "New businesses are reviewed by the platform team before access is approved.",
      detail: summary.pendingBusinesses === null ? "Pending applications —" : `${summary.pendingBusinesses} pending application${summary.pendingBusinesses === 1 ? "" : "s"}`,
      href: "/super-admin/businesses?status=pending",
      action: "Review applications"
    },
    {
      icon: Wallet,
      category: "Billing",
      title: "Plans & billing",
      status: "Not configured",
      statusTone: "unavailable",
      description: "Platform-wide subscription billing and plan management are not available yet.",
      detail: "No billing controls configured",
      href: "",
      action: ""
    },
    {
      icon: Users,
      category: "Access control",
      title: "Users & roles",
      status: "Available",
      statusTone: "available",
      description: "Manage platform administrators and business-owner access from the user directory.",
      detail: summary.accounts === null ? "Accounts —" : `${summary.accounts} platform and business account${summary.accounts === 1 ? "" : "s"}`,
      href: "/super-admin/users",
      action: "Manage users"
    },
    {
      icon: CreditCard,
      category: "Payments",
      title: "Payment integrations",
      status: "Business-level",
      statusTone: "review",
      description: "Payment credentials and provider readiness are managed per business, not as a platform-wide integration.",
      detail: summary.pendingPayments === null ? "Pending payment orders —" : `${summary.pendingPayments} order${summary.pendingPayments === 1 ? "" : "s"} awaiting payment`,
      href: "/super-admin/payments",
      action: "Open payment management"
    },
    {
      icon: Bell,
      category: "Communications",
      title: "Support & announcements",
      status: "Not configured",
      statusTone: "unavailable",
      description: "A platform-wide announcement and messaging management interface is not configured.",
      detail: "No announcement tools configured",
      href: "",
      action: ""
    },
    {
      icon: Database,
      category: "Infrastructure",
      title: "System dependencies",
      status: "Live checks",
      statusTone: "available",
      description: "Review the platform’s service readiness and operational health checks.",
      detail: "Readiness checks available",
      href: "/super-admin/overview",
      action: "View health checks"
    }
  ];

  return <div className="page-content platform-settings-page">
    <PageHeader
      eyebrow="PLATFORM CONFIGURATION"
      title="Settings"
      description="Review platform configuration, access controls, and service availability."
      actions={<button className="button subtle compact" onClick={loadSummary} disabled={loading}><RefreshCw size={14} /> Refresh</button>}
    />
    <section className="settings-summary" aria-label="Settings availability">
      <div><span className="settings-summary-icon"><ShieldCheck size={18} /></span><span><b>Configuration overview</b><small>Platform controls and their current availability</small></span></div>
      <strong>2 <small>of 6 available</small></strong>
    </section>
    {error && <div className="inline-error" role="alert">Couldn’t load current settings counts: {error}</div>}
    <div className="platform-settings-grid">
      {cards.map(({ icon: Icon, category, title, status, statusTone, description, detail, href, action }) => (
        <article className="platform-setting-card" key={title}>
          <div className="platform-setting-top">
            <span className="platform-setting-icon"><Icon size={18} /></span>
            <span className="platform-setting-category">{category}</span>
            <span className={`platform-setting-status ${statusTone}`}>{status}</span>
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
          <div className="platform-setting-footer">
            <span>{detail}</span>
            {href ? <a href={href}>{action}<span aria-hidden="true"> →</span></a> : <span className="platform-setting-disabled">Unavailable</span>}
          </div>
        </article>
      ))}
    </div>
    <p className="settings-health-note"><Activity size={15} /> Availability reflects the controls currently implemented in Vendora. Service health details are shown in the platform overview.</p>
  </div>;
}
