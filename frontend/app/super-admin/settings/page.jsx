import { CircleHelp, CreditCard, Database, Globe2, ShieldCheck, Users } from "lucide-react";
import { PageHeader, Panel } from "../../../components/AppShell";

export default function PlatformSettingsPage() {
  return <div className="page-content">
    <PageHeader eyebrow="PLATFORM CONFIGURATION" title="Platform settings" description="Integrations and operational controls currently available to this installation." />
    <div className="settings-grid">
      <Panel title="Registration & tenant lifecycle"><div className="setting-row"><Globe2 /><div><b>Tenant registration</b><p>Business onboarding is managed through approved tenant records.</p></div><span className="status-pill neutral">Manual review</span></div></Panel>
      <Panel title="Billing"><div className="setting-row"><CreditCard /><div><b>Platform subscriptions</b><p>Subscription plans, invoicing, and platform revenue are not configured.</p></div><span className="status-pill pending">Unavailable</span></div></Panel>
      <Panel title="Users & roles"><div className="setting-row"><Users /><div><b>Platform and company accounts</b><p>Create platform administrators and assign company dashboard accounts to businesses.</p><a className="text-link" href="/super-admin/users">Open user management</a></div><span className="status-pill active">Available</span></div></Panel>
      <Panel title="Payment integrations"><div className="setting-row"><ShieldCheck /><div><b>Merchant gateway</b><p>No payment provider or signed webhook is configured. Orders remain pending payment.</p><a className="text-link" href="/super-admin/payments">Open payment management</a></div><span className="status-pill pending">Not configured</span></div></Panel>
      <Panel title="System dependencies"><div className="setting-row"><Database /><div><b>MongoDB and API health</b><p>Live readiness checks are available from the platform overview.</p></div><span className="status-pill active">Live checks</span></div></Panel>
      <Panel title="Support & announcements"><div className="setting-row"><CircleHelp /><div><b>Platform support inbox</b><p>Support tickets and tenant announcements are not configured in this release.</p></div><span className="status-pill pending">Unavailable</span></div></Panel>
    </div>
  </div>;
}
