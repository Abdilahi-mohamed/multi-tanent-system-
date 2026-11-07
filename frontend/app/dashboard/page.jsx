"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, BadgeCheck, Boxes, CircleDollarSign, CircleHelp, Clock3, MessageCircle, PackageCheck, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { api, money, shortDate } from "../../lib/api";
import { LoadingState, MetricCard, PageHeader, Panel, StatusPill } from "../../components/AppShell";

export default function TenantOverview() {
  const [data, setData] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [overview, auth] = await Promise.all([api("/tenant/overview"), api("/auth/me")]);
      setData(overview);
      setTenant(auth.tenant);
      setError("");
    } catch (reason) { setError(reason.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="page-content"><LoadingState error={error} retry={load} /></div>;
  const m = data.metrics;
  return <div className="page-content tenant-dashboard">
    <PageHeader eyebrow={`${tenant?.name || "YOUR STOREFRONT"}  /  STORE OPERATIONS`} title={<>Welcome back, {tenant?.ownerName || "Merchant"} <span className="blue-text">• {tenant?.name}</span></>} description="Your store performance and fulfillment activity, scoped to this business." actions={<><span className="status-pill active">Tenant active</span><a className="button subtle" href="/dashboard/support"><CircleHelp size={15} /> Customer Support</a><a className="button primary" href="/dashboard/products">＋ Add New Product</a></>} />
    <div className="tenant-context"><span><ShieldCheck size={14} /> Tenant ID · {String(tenant?._id || "").slice(-8) || "Loading"}</span><span><BadgeCheck size={14} /> Plan: {tenant?.plan || "Not configured"}</span><a href={`/store/${tenant?.slug || ""}`} target="_blank" rel="noreferrer">View public storefront ↗</a></div>
    <div className="metric-grid tenant-metrics">
      <MetricCard label="RECORDED PAID SALES" value={money(m.recordedPaidSales)} note="Order records marked paid; provider is not connected" icon={CircleDollarSign} />
      <MetricCard label="ACTIVE PRODUCTS" value={m.activeProducts.toLocaleString()} note={`${m.products} total products`} icon={Boxes} tone="green" />
      <MetricCard label="FULFILLMENT QUEUE" value={`${m.newOrders} Orders`} note={`${m.orders} total orders`} icon={ShoppingBag} tone="blue" />
      <MetricCard label="PENDING PAYMENTS" value={m.pendingPayments.toLocaleString()} note="Awaiting verified provider callback" icon={Clock3} tone="amber" />
    </div>
    <div className="dashboard-columns tenant-columns">
      <div className="stack">
        <Panel title="Recent Customer Orders & Fulfillment Queue" action={<a className="text-link" href="/dashboard/orders">View all orders →</a>}>
          <div className="table-wrap"><table><thead><tr><th>ORDER ID</th><th>CUSTOMER</th><th>ITEM / VARIANT</th><th>TOTAL</th><th>PAYMENT</th><th>FULFILLMENT</th></tr></thead><tbody>
            {data.recentOrders.map((order) => <tr key={order._id}><td><b>{order.orderNumber}</b><small className="table-subline">{shortDate(order.createdAt)}</small></td><td>{order.customer.name}<small className="table-subline">{order.customer.phone}</small></td><td>{order.item.name}<small className="table-subline">{order.item.variant} · Qty {order.item.quantity}</small></td><td><b>{money(order.total)}</b></td><td><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></td><td><StatusPill tone={order.fulfillmentStatus}>{order.fulfillmentStatus}</StatusPill></td></tr>)}
            {!data.recentOrders.length && <tr><td colSpan="6" className="empty-table">Orders from your public storefront will appear here.</td></tr>}
          </tbody></table></div>
        </Panel>
        <Panel title="Variant Inventory Health & Depletion Watch" action={<span className="quiet-label">LOW STOCK ≤ 5</span>}>
          {error ? <LoadingState error={error} retry={load} /> : <InventorySummary />}
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Payment Gateway & Payouts" action={<span className="quiet-label">LOCKED</span>}>
          <div className="payment-empty"><div className="payment-mark">₿</div><div><b>Payment provider not configured</b><p>Payments are never marked as paid from customer actions. Connect a supported merchant gateway and signed webhook before accepting online payments.</p></div><a className="button subtle compact" href="/dashboard/payment-gateway-settings">Payment Gateway Settings</a></div>
          <div className="security-note"><ShieldCheck size={16} /><span>Unverified orders remain clearly marked as pending payment.</span></div>
        </Panel>
        <SupportSummary />
        <Panel title="Storefront Stream" action={<span className="quiet-label">RECENT EVENTS</span>}>
          {data.recentOrders.length ? data.recentOrders.slice(0, 4).map((order) => <div className="stream-item" key={order._id}><span className="stream-node" /><div><b>{order.fulfillmentStatus === "new" ? "New order received" : "Order updated"}</b><p>{order.customer.name} · {order.orderNumber} · {order.paymentStatus}</p><small>{shortDate(order.createdAt)}</small></div></div>) : <div className="empty-state">New orders and customer activity will appear here.</div>}
          <div className="stream-link"><a href="/dashboard/order-chat">Open customer order chat →</a></div>
        </Panel>
        <div className="notice-card"><Sparkles size={16} /><p><b>Store insights</b><br />Sales and inventory totals come from your own records. No sales or payment figures are estimated.</p></div>
      </div>
    </div>
  </div>;
}

function SupportSummary() {
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api("/tenant/support/conversations?limit=3");
      setConversations(result.items);
      setTotal(result.total);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <Panel title="Customer Support" action={<a className="text-link" href="/dashboard/support">Open chat →</a>}>
    {error
      ? <div className="empty-state">{error} <button className="text-link" onClick={load}>Try again</button></div>
      : loading
        ? <div className="empty-state">Loading your support conversations…</div>
        : <div className="support-summary">
          <div className="support-summary-intro"><MessageCircle size={16} /><p>Contact the Super Admin. Your message and their replies are saved in this conversation.</p></div>
          {conversations.length
            ? <>{conversations.map((conversation) => <a className="support-summary-item" href="/dashboard/support" key={conversation._id}><span><b>{conversation.subject}</b><small>{conversation.lastMessage}</small></span><StatusPill tone={conversation.status}>{conversation.status.replace("_", " ")}</StatusPill></a>)}<small className="support-summary-count">{total} support {total === 1 ? "conversation" : "conversations"}</small></>
            : <p className="support-summary-empty">No support conversations yet. Start one if you need help.</p>}
          <a className="button primary compact support-summary-action" href="/dashboard/support"><CircleHelp size={14} /> {conversations.length ? "Message Super Admin" : "Start a conversation"}</a>
        </div>}
  </Panel>;
}

function InventorySummary() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api("/tenant/products").then((result) => setProducts(result.items)).catch((reason) => setError(reason.message)); }, []);
  if (error) return <div className="empty-state">{error}</div>;
  if (!products.length) return <div className="empty-state">Add products with size/color variants to track stock.</div>;
  const rows = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })))
    .sort((a, b) => a.variant.stock - b.variant.stock).slice(0, 4);
  return <div className="inventory-list">{rows.map(({ product, variant }) => <div className="inventory-row" key={variant._id}><span className="inventory-icon"><PackageCheck size={16} /></span><div><b>{product.name}</b><small>{[variant.size, variant.color, ...(variant.attributes || []).map(({ name, value }) => `${name}: ${value}`)].filter(Boolean).join(" · ") || variant.sku}</small></div><strong>{variant.stock} units</strong><StatusPill tone={variant.stock <= 5 ? "warning" : "active"}>{variant.stock <= 5 ? "Low stock" : "Healthy"}</StatusPill></div>)}</div>;
}
