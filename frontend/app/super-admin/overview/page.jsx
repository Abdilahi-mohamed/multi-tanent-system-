"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Building2, CircleDollarSign, Clock3, ShieldCheck, Users, Wallet } from "lucide-react";
import { api, money, shortDate } from "../../../lib/api";
import { LoadingState, MetricCard, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

export default function PlatformOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/admin/overview").then(setData).catch((reason) => setError(reason.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="page-content"><LoadingState error={error} retry={load} /></div>;
  const metrics = data.metrics;
  return <div className="page-content">
    <PageHeader eyebrow="SUPER ADMIN WORKSPACE" title="Commerce Integrations & Global Ledger Monitoring" description="Platform-wide activity, tenant health, and verified commerce signals." actions={<><span className="status-pill neutral">Health checks available</span><a className="button primary" href="/super-admin/businesses">＋ New Business</a></>} />
    <div className="directive-banner"><div className="directive-icon"><ShieldCheck size={19} /></div><div><b>PAYMENT PROCESSING READINESS</b><p>No payment provider adapter has been verified. Store orders remain pending until an authorized integration is configured.</p></div><span className="banner-tag">ONLINE CHECKOUT<br /><b>DISABLED</b></span></div>
    <div className="metric-grid admin-metrics">
      <MetricCard label="Registered Businesses" value={metrics.totalBusinesses.toLocaleString()} note={`${metrics.activeBusinesses} active businesses`} icon={Building2} />
      <MetricCard label="Registered Users" value={metrics.registeredUsers.toLocaleString()} note="Active accounts in platform" icon={Users} tone="green" />
      <MetricCard label="Recorded Paid Orders" value={money(metrics.recordedPaidOrderVolume)} note="Amounts recorded with paid status; no provider verification is configured" icon={CircleDollarSign} tone="blue" />
      <MetricCard label="Total Orders" value={metrics.totalOrders.toLocaleString()} note="Across all tenant stores" icon={Wallet} tone="amber" />
    </div>
    <div className="metric-grid small-metrics">
      <MetricCard label="Active Businesses" value={metrics.activeBusinesses.toLocaleString()} note="Approved & operational" icon={Activity} tone="green" />
      <MetricCard label="Pending Approvals" value={metrics.pendingBusinesses.toLocaleString()} note="Awaiting platform review" icon={Clock3} tone="amber" />
      <MetricCard label="Suspended Businesses" value={metrics.suspendedBusinesses.toLocaleString()} note="Restricted by platform admin" icon={ArrowDownRight} tone="red" />
      <MetricCard label="Platform Subscription Revenue" value="Not configured" note="Billing integration unavailable" icon={ArrowUpRight} tone="muted" />
    </div>
    <div className="dashboard-columns admin-columns">
      <div className="stack">
        <Panel title="Business Registration Monitor" action={<a className="text-link" href="/super-admin/businesses">View all businesses →</a>}>
          <div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>OWNER</th><th>REGISTERED</th><th>STATUS</th></tr></thead><tbody>
            {data.recentBusinesses.map((business) => <tr key={business._id}><td><div className="business-cell"><span className="square-logo">{business.name.slice(0, 2).toUpperCase()}</span><div><b>{business.name}</b><small>{business.category}</small></div></div></td><td>{business.ownerName}</td><td>{shortDate(business.createdAt)}</td><td><StatusPill tone={business.status}>{business.status}</StatusPill></td></tr>)}
            {!data.recentBusinesses.length && <tr><td colSpan="4" className="empty-table">No businesses are registered yet.</td></tr>}
          </tbody></table></div>
        </Panel>
        <Panel title="Recent Commerce Activity" action={<span className="quiet-label">LIVE LEDGER</span>}>
          <div className="activity-list">{data.recentOrders.map((order) => <div className="activity-row" key={order._id}><span className="timeline-dot blue-dot" /><div><b>{order.orderNumber} · {order.tenantId?.name || "Business"}</b><p>{order.customer.name} · {money(order.total)} · payment {order.paymentStatus}</p></div><small>{shortDate(order.createdAt)}</small></div>)}{!data.recentOrders.length && <div className="empty-state">No orders have been recorded.</div>}</div>
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Platform Health" action={<span className="quiet-label">CHECKS ARE LIVE</span>}>
          <HealthCard />
        </Panel>
        <Panel title="Pending Approvals" action={<a className="text-link" href="/super-admin/businesses?status=pending">Review →</a>}>
          {data.recentBusinesses.filter((business) => business.status === "pending").slice(0, 4).map((business) => <div className="approval-item" key={business._id}><span className="square-logo">{business.name.slice(0, 2).toUpperCase()}</span><div><b>{business.name}</b><small>{business.category} · {shortDate(business.createdAt)}</small></div><StatusPill tone="pending">Pending</StatusPill></div>)}
          {!data.recentBusinesses.some((business) => business.status === "pending") && <div className="empty-state">No pending applications.</div>}
        </Panel>
        <Panel title="Recent Administrative Activity">
          {data.activity.length ? data.activity.map((item) => <div className="audit-line" key={item._id}><span className="timeline-dot" /><div><b>{item.action.replaceAll(".", " ")}</b><small>{item.targetType} · {shortDate(item.createdAt)}</small></div></div>) : <div className="empty-state">Administrative actions will appear here when recorded.</div>}
        </Panel>
      </div>
    </div>
  </div>;
}

function HealthCard() {
  const [health, setHealth] = useState(null);
  useEffect(() => { api("/health").then(setHealth).catch((error) => setHealth({ status: "unavailable", checks: { api: "unknown", database: error.message } })); }, []);
  if (!health) return <div className="health-loading">Checking API and database…</div>;
  return <div className="health-checks">{Object.entries(health.checks).map(([name, status]) => <div key={name}><span className={`health-dot ${status === "healthy" ? "good" : "bad"}`} /><span>{name === "api" ? "Backend API" : "MongoDB database"}</span><b>{status}</b></div>)}</div>;
}
