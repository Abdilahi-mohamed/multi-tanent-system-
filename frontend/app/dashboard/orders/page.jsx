"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { api, money, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const filters = ["all", "pending_payment", "new", "processing", "ready", "shipped", "delivered", "cancelled"];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState(null);
  const [deliveryError, setDeliveryError] = useState("");
  const load = useCallback(() => api(`/tenant/orders${filter === "all" ? "" : `?status=${filter}`}`).then((result) => { setOrders(result.items); setError(""); }).catch((reason) => setError(reason.message)), [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requestedSearch = new URLSearchParams(window.location.search).get("search");
    if (requestedSearch) setSearch(requestedSearch);
  }, []);

  async function updateStatus(order, fulfillmentStatus) {
    setBusy(order._id);
    setError("");
    try {
      await api(`/tenant/orders/${order._id}/fulfillment`, { method: "PATCH", body: JSON.stringify({ fulfillmentStatus }) });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(""); }
  }

  function showDetails(order) {
    setSelectedOrder(order);
    setDeliveryError("");
    setDeliveryForm({
      phone: order.customer.phone || "",
      email: order.customer.email || "",
      address: order.customer.address || "",
      location: order.customer.location || "",
      instructions: order.customer.instructions || "",
      deliveryFee: String(order.deliveryFee || 0)
    });
  }

  async function saveDelivery(event) {
    event.preventDefault();
    if (!selectedOrder) return;
    setBusy(selectedOrder._id);
    setDeliveryError("");
    try {
      const result = await api(`/tenant/orders/${selectedOrder._id}/delivery`, {
        method: "PATCH",
        body: JSON.stringify({ ...deliveryForm, deliveryFee: Number(deliveryForm.deliveryFee) })
      });
      setSelectedOrder(result.order);
      setDeliveryForm({
        phone: result.order.customer.phone || "",
        email: result.order.customer.email || "",
        address: result.order.customer.address || "",
        location: result.order.customer.location || "",
        instructions: result.order.customer.instructions || "",
        deliveryFee: String(result.order.deliveryFee || 0)
      });
      await load();
    } catch (reason) {
      setDeliveryError(reason.message);
    } finally {
      setBusy("");
    }
  }

  const visibleOrders = orders.filter((order) => `${order.orderNumber} ${order.customer.name} ${order.customer.phone} ${(order.items?.length ? order.items : [order.item]).map((item) => `${item.name} ${item.sku} ${item.sectionName}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const selectedItems = selectedOrder?.items?.length ? selectedOrder.items : selectedOrder ? [selectedOrder.item] : [];
  return <div className="page-content">
    <PageHeader eyebrow="COMMERCE OPERATIONS" title="Orders & fulfillment" description="Review order snapshots, customer delivery details, and fulfillment. Payments remain pending until confirmed by a configured provider." />
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Panel title={`Store orders · ${orders.length}`} action={<div className="filter-actions"><label className="table-search"><Search size={15} /><input placeholder="Search order or customer" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></div>}>
      {error && !orders.length ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER & DELIVERY</th><th>ITEM</th><th>TOTAL</th><th>PAYMENT</th><th>FULFILLMENT</th><th /></tr></thead><tbody>
        {visibleOrders.map((order) => <tr key={order._id}><td><b>{order.orderNumber}</b><small className="table-subline">{shortDate(order.createdAt)}</small></td><td>{order.customer.name}<small className="table-subline">{order.customer.phone} · {order.customer.address}</small></td><td>{order.items?.length > 1 ? `${order.items[0].name} + ${order.items.length - 1} more` : order.item.name}<small className="table-subline">{order.item.sectionName || order.item.variant} · {order.item.variant || "Standard"} × {order.item.quantity}</small></td><td><b>{money(order.total)}</b></td><td><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></td><td><select disabled={busy === order._id || ["cancelled", "delivered"].includes(order.fulfillmentStatus)} value={order.fulfillmentStatus} onChange={(event) => updateStatus(order, event.target.value)}>{["new", "processing", "ready", "shipped", "delivered", "cancelled"].map((item) => <option value={item} key={item}>{item}</option>)}</select></td><td><button className="button subtle compact" onClick={() => showDetails(order)}>View details</button></td></tr>)}
        {!visibleOrders.length && <tr><td colSpan="7" className="empty-table">No orders match your search and filter.</td></tr>}
      </tbody></table></div>}
    </Panel>
    {selectedOrder && deliveryForm && <div className="order-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrder(null); }}>
      <section className="order-dialog" role="dialog" aria-modal="true" aria-labelledby="order-dialog-title">
        <header className="order-dialog-header"><div><p className="eyebrow">ORDER DETAILS</p><h2 id="order-dialog-title">{selectedOrder.orderNumber}</h2><small>Placed {new Date(selectedOrder.createdAt).toLocaleString()}</small></div><button className="icon-button" aria-label="Close order details" onClick={() => setSelectedOrder(null)}><X size={18} /></button></header>
        <div className="order-dialog-content">
          <div className="order-lines">{selectedItems.map((item, index) => <div className="order-detail-product" key={`${item.productId}-${item.variantId}-${index}`}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span className="square-logo">PR</span>}<div><b>{item.name}</b><small>{item.sectionName || "Product"} · {item.variant || "Standard"}</small><small>SKU {item.sku || "—"} · Size {item.size || "—"} · Color {item.color || "—"}</small><small>{money(item.unitPrice)} each × {item.quantity} = {money(item.lineTotal ?? item.unitPrice * item.quantity)}</small></div></div>)}</div>
          <div className="order-totals"><span>Subtotal</span><b>{money(selectedOrder.subtotal)}</b><span>Delivery fee</span><b>{money(selectedOrder.deliveryFee)}</b><span>Discount</span><b>{money(selectedOrder.discount)}</b><span>Order total</span><b>{money(selectedOrder.total)}</b></div>
          <div className="order-statuses"><span>Payment · <StatusPill tone={selectedOrder.paymentStatus}>{selectedOrder.paymentStatus}</StatusPill></span><span>Fulfillment · <StatusPill tone={selectedOrder.fulfillmentStatus}>{selectedOrder.fulfillmentStatus}</StatusPill></span><span>Payment method · <b>{selectedOrder.paymentMethod?.replaceAll("_", " ") || "Pay on delivery"}</b></span></div>
          <form className="order-delivery-form" onSubmit={saveDelivery}>
            <h3>Customer and delivery details</h3>
            <div className="form-grid"><label>Customer name<input value={selectedOrder.customer.name} readOnly /></label><label>Phone<input required minLength="5" value={deliveryForm.phone} onChange={(event) => setDeliveryForm({ ...deliveryForm, phone: event.target.value })} /></label><label>Email<input type="email" value={deliveryForm.email} onChange={(event) => setDeliveryForm({ ...deliveryForm, email: event.target.value })} /></label><label>Delivery location<input value={deliveryForm.location} onChange={(event) => setDeliveryForm({ ...deliveryForm, location: event.target.value })} /></label><label className="wide-field">Address<textarea required minLength="5" maxLength="500" rows="2" value={deliveryForm.address} onChange={(event) => setDeliveryForm({ ...deliveryForm, address: event.target.value })} /></label><label className="wide-field">Customer notes<textarea maxLength="500" rows="2" value={deliveryForm.instructions} onChange={(event) => setDeliveryForm({ ...deliveryForm, instructions: event.target.value })} /></label><label>Delivery fee<input type="number" min="0" step="0.01" value={deliveryForm.deliveryFee} onChange={(event) => setDeliveryForm({ ...deliveryForm, deliveryFee: event.target.value })} /></label></div>
            <p className="payment-method-note">Payment state is not changed here. A payment must be confirmed by an integrated provider before it can be marked paid.</p>
            {deliveryError && <p className="inline-error" role="alert">{deliveryError}</p>}
            <div className="form-actions"><a className="button subtle" href={`/dashboard/order-chat?orderId=${selectedOrder._id}`}>Open customer conversation</a><button type="submit" className="button primary" disabled={busy === selectedOrder._id}>{busy === selectedOrder._id ? "Saving…" : "Save delivery details"}</button></div>
          </form>
        </div>
      </section>
    </div>}
  </div>;
}
