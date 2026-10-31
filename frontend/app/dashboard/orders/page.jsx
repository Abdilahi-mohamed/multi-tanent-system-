"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, money, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const filters = ["all", "pending_payment", "new", "processing", "ready", "shipped", "delivered", "cancelled"];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api(`/tenant/orders${filter === "all" ? "" : `?status=${filter}`}`).then((result) => { setOrders(result.items); setError(""); }).catch((reason) => setError(reason.message)), [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requestedSearch = new URLSearchParams(window.location.search).get("search");
    if (requestedSearch) setSearch(requestedSearch);
  }, []);

  async function updateStatus(order, fulfillmentStatus) {
    setBusy(order._id);
    try {
      await api(`/tenant/orders/${order._id}/fulfillment`, { method: "PATCH", body: JSON.stringify({ fulfillmentStatus }) });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(""); }
  }

  const visibleOrders = orders.filter((order) => `${order.orderNumber} ${order.customer.name} ${order.customer.phone} ${order.item.name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page-content">
    <PageHeader eyebrow="COMMERCE OPERATIONS" title="Orders & fulfillment" description="Payment and fulfillment states are tracked separately." />
    <Panel title="Store orders" action={<div className="filter-actions"><label className="table-search"><Search size={15} /><input placeholder="Search order or customer" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></div>}>
      {error && !orders.length ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER & DELIVERY</th><th>ITEM</th><th>TOTAL</th><th>PAYMENT</th><th>FULFILLMENT</th></tr></thead><tbody>
        {visibleOrders.map((order) => <tr key={order._id}><td><b>{order.orderNumber}</b><small className="table-subline">{shortDate(order.createdAt)}</small></td><td>{order.customer.name}<small className="table-subline">{order.customer.phone} · {order.customer.address}</small></td><td>{order.item.name}<small className="table-subline">{order.item.variant} × {order.item.quantity}</small></td><td><b>{money(order.total)}</b></td><td><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></td><td><select disabled={busy === order._id} value={order.fulfillmentStatus} onChange={(event) => updateStatus(order, event.target.value)}>{["new", "processing", "ready", "shipped", "delivered", "cancelled"].map((item) => <option value={item} key={item}>{item}</option>)}</select></td></tr>)}
        {!visibleOrders.length && <tr><td colSpan="6" className="empty-table">No orders match your search and filter.</td></tr>}
      </tbody></table></div>}
    </Panel>
  </div>;
}
