"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Clock3, CreditCard, Search, ShieldCheck } from "lucide-react";
import { LoadingState, MetricCard, PageHeader, Panel, StatusPill } from "../../../components/AppShell";
import { PaymentProviderCatalog } from "../../../components/PaymentProviderCatalog";
import { api, money, shortDate } from "../../../lib/api";

const paymentStatuses = ["all", "pending", "paid", "failed", "refunded"];

export default function PaymentsPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ status, search, page: String(page), limit: "50" });
    setLoading(true);
    try {
      setError("");
      setData(await api(`/tenant/payments?${query}`));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  const metrics = data?.metrics;

  return <div className="page-content">
    <PageHeader eyebrow="PAYMENTS & SALES" title="Payments" description="Review this company's order payment status and provider setup readiness." />

    <div className="payment-safety-banner"><ShieldCheck size={18} /><div><b>Online payment integration is not configured</b><p>Orders can be placed, but customers cannot pay through this app yet. Payment statuses below are order records, not live provider verification. Never share API keys or card details in chat or support notes.</p></div></div>

    <div className="metric-grid payment-metrics">
      <MetricCard label="ORDERS" value={(metrics?.total || 0).toLocaleString()} note="Payment activity for this company" icon={CreditCard} />
      <MetricCard label="PENDING" value={(metrics?.pending || 0).toLocaleString()} note="No provider confirmation received" icon={Clock3} tone="amber" />
      <MetricCard label="RECORDED AS PAID" value={(metrics?.paid || 0).toLocaleString()} note={money(metrics?.paidVolume || 0)} icon={CircleDollarSign} tone="green" />
      <MetricCard label="FAILED / REFUNDED" value={((metrics?.failed || 0) + (metrics?.refunded || 0)).toLocaleString()} note={`${metrics?.failed || 0} failed · ${metrics?.refunded || 0} refunded`} icon={CircleDollarSign} tone="muted" />
    </div>

    <Panel title="Order payment history" action={<div className="filter-actions"><label className="table-search"><Search size={14} /><input aria-label="Search payment history" placeholder="Search order or item" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filter payment status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{paymentStatuses.map((item) => <option value={item} key={item}>{item === "all" ? "All payment statuses" : item}</option>)}</select></div>}>
      {loading && !data ? <LoadingState /> : error && !data ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>ITEM</th><th>AMOUNT</th><th>RECORDED STATUS</th><th>DATE</th></tr></thead><tbody>
        {(data?.items || []).map((order) => <tr key={order._id}>
          <td><b>{order.orderNumber}</b></td><td>{order.item.name}<small className="table-subline">{order.item.variant || "Standard"} × {order.item.quantity}</small></td><td><b>{money(order.total)}</b></td><td><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></td><td>{shortDate(order.createdAt)}</td>
        </tr>)}
        {!error && !data?.items.length && <tr><td colSpan="5" className="empty-table">No order payment activity matches these filters.</td></tr>}
      </tbody></table></div>}
      {error && data && <p className="inline-error payment-inline-error" role="alert">{error}</p>}
      <div className="user-pagination"><button className="button subtle compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(data?.pages || 1, 1)} · {data?.total || 0} orders</span><button className="button subtle compact" disabled={page >= (data?.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
    </Panel>

    <Panel title="Payment provider options" className="payment-readiness-panel">
      <p className="payment-section-note">The platform will enable a provider only after a verified adapter is installed. Nothing is connected yet; contact your platform administrator when authorized merchant API documentation and staging credentials are available.</p>
      <PaymentProviderCatalog />
    </Panel>
  </div>;
}
