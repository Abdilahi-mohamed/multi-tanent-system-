"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { api, money, shortDate } from "../lib/api";
import { LoadingState, PageHeader, StatusPill } from "./AppShell";

const statusNames = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export function OrderSupportInbox({ role = "business_owner" }) {
  const isAdmin = role === "super_admin";
  const basePath = isAdmin ? "/admin/order-conversations" : "/tenant/conversations";
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [thread, setThread] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await api(`${basePath}${statusFilter === "all" ? "" : `?status=${statusFilter}`}`);
      setConversations(result.items);
      const requestedOrderId = new URLSearchParams(window.location.search).get("orderId");
      const requestedConversation = requestedOrderId && result.items.find((item) => String(item.orderId?._id || item.orderId) === requestedOrderId);
      if (requestedOrderId) window.history.replaceState({}, "", window.location.pathname);
      setSelectedId((current) => requestedConversation?._id || (current && result.items.some((item) => item._id === current)
        ? current
        : result.items[0]?._id || ""));
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [basePath, statusFilter]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) { setThread(null); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await api(`${basePath}/${selectedId}`);
        if (active) { setThread(result); setError(""); }
      } catch (reason) {
        if (active) setError(reason.message);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [basePath, selectedId]);

  const conversation = thread?.conversation;
  const order = thread?.order || conversation?.orderId;
  const orderItems = order?.items?.length ? order.items : order?.item ? [order.item] : [];
  const messages = conversation?.messages || [];
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const visible = conversations.filter((item) => {
    const orderInfo = item.orderId || {};
    const tenantName = item.tenantId?.name || "";
    return `${item.customerName} ${item.customerEmail || ""} ${item.customerPhone} ${orderInfo.orderNumber || ""} ${tenantName}`
      .toLowerCase().includes(search.trim().toLowerCase());
  });

  async function sendMessage(event) {
    event.preventDefault();
    if (!body.trim() || !selectedId) return;
    setBusy(true);
    setError("");
    try {
      await api(`${basePath}/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      await api(`${basePath}/${selectedId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await Promise.all([load(), api(`${basePath}/${selectedId}`).then(setThread)]);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content chat-page">
    <PageHeader eyebrow={isAdmin ? "PLATFORM CUSTOMER SUPPORT" : "CUSTOMER COMMUNICATIONS"} title={isAdmin ? "Store Customer Support" : "Order chat & customer support"} description={isAdmin ? "Authorized platform access to order-related storefront conversations." : "Reply to customer questions tied to orders from your storefront."} actions={<button className="button subtle compact" onClick={load}><RefreshCw size={14} /> Refresh</button>} />
    {error && conversations.length > 0 && <p className="inline-error" role="alert">{error}</p>}
    {error && !conversations.length ? <LoadingState error={error} retry={load} /> : loading ? <LoadingState /> : <div className="chat-layout">
      <aside className="chat-list-panel">
        <div className="chat-list-title"><b>Order conversations</b><span>{conversations.length}</span></div>
        <input className="chat-search" placeholder={isAdmin ? "Search customer, business, or order…" : "Search customer or order…"} value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="chat-filters">{["all", "open", "in_progress", "resolved"].map((item) => <button type="button" className={statusFilter === item ? "active" : ""} key={item} onClick={() => setStatusFilter(item)}>{item === "all" ? `All (${conversations.length})` : statusNames[item]}</button>)}</div>
        <div className="conversation-list">{visible.map((item) => {
          const itemOrder = item.orderId || {};
          return <button className={`conversation-item ${selectedId === item._id ? "selected" : ""}`} onClick={() => setSelectedId(item._id)} key={item._id}>
            <span className="avatar conversation-avatar">{item.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div><div className="conversation-meta"><b>{item.customerName}</b><small>{shortDate(item.updatedAt)}</small></div>
              <p>{item.messages?.at(-1)?.body || "Order support conversation"}</p>
              <div className="conversation-meta"><small>{itemOrder.orderNumber || "Order"} · {item.orderIds?.length || 1} orders{isAdmin && item.tenantId?.name ? ` · ${item.tenantId.name}` : ""}</small>{(isAdmin ? item.unreadByAdmin : item.unreadByMerchant) && <i className="support-unread-dot" aria-label="Unread message" />}</div>
            </div>
          </button>;
        })}{!visible.length && <div className="empty-state">{conversations.length ? "No conversations match your search." : "New order support conversations will appear here."}</div>}</div>
      </aside>
      {conversation ? <section className="chat-thread">
        <header className="thread-header">
          <span className="avatar">{conversation.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div><b>{conversation.customerName}</b><small>{conversation.customerEmail || conversation.customerPhone} · {conversation.orderIds?.length || 1} orders{isAdmin && conversation.tenantId?.name ? ` · ${conversation.tenantId.name}` : ""}</small></div>
          <select aria-label="Conversation status" disabled={busy} value={conversation.status || "open"} onChange={(event) => setStatus(event.target.value)}>{Object.entries(statusNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select>
        </header>
        <div className="thread-messages">{messages.map((message) => <div className={`message-row ${message.sender !== "customer" ? "from-merchant" : ""}`} key={message._id}><div className="message-bubble"><p>{message.body}</p><small>{message.senderName || (message.sender === "customer" ? conversation.customerName : message.sender === "platform_admin" ? "Platform support" : "Store support")}{message.orderId?.orderNumber ? ` · Order ${message.orderId.orderNumber}` : ""} · {new Date(message.createdAt).toLocaleString()}{(message.readByCustomerAt || message.readAt) && message.sender !== "customer" ? " · Read by customer" : ""}</small></div></div>)}<div ref={bottomRef} /></div>
        <form className="composer" onSubmit={sendMessage}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={`Reply to ${conversation.customerName}…`} /><button className="button primary" disabled={busy || !body.trim()}><Send size={15} /> Send</button></form>
      </section> : <section className="chat-thread chat-empty"><MessageCircle size={32} /><b>Select a conversation</b><p>Customer chats are grouped by account within this business.</p></section>}
      <aside className="customer-dossier">
        <div className="dossier-heading">ORDER & CUSTOMER</div>
        {conversation && order && <><div className="dossier-profile"><span className="avatar large">{conversation.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><b>{conversation.customerName}</b><small>{conversation.customerEmail || conversation.customerPhone}</small></div></div>
          <div className="dossier-order"><h3>{order.orderNumber}</h3>
            {orderItems.map((item, index) => <div className="dossier-item" key={`${item.productId}-${item.variantId}-${index}`}>{item.imageUrl && <img src={item.imageUrl} alt="" />}<div><b>{item.name}</b><small>{item.sectionName} · {item.variant || "Standard"}{item.sku ? ` · ${item.sku}` : ""} × {item.quantity}</small></div><b>{money(item.lineTotal ?? item.unitPrice * item.quantity)}</b></div>)}
            <div className="dossier-info"><span>Order total</span><b>{money(order.total)}</b></div>
            <div className="dossier-info"><span>Payment</span><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></div>
            <div className="dossier-info"><span>Fulfillment</span><StatusPill tone={order.fulfillmentStatus}>{order.fulfillmentStatus}</StatusPill></div>
            <div className="dossier-info"><span>Conversation</span><StatusPill tone={conversation.status}>{statusNames[conversation.status] || "Open"}</StatusPill></div>
            <div className="dossier-address">{order.customer?.address}{order.customer?.location ? ` · ${order.customer.location}` : ""}{order.customer?.instructions ? ` · Note: ${order.customer.instructions}` : ""}</div>
          </div><div className="security-note"><ShieldCheck size={16} /><span>{isAdmin ? "Platform-level support access is audited separately from store-owner account support." : "Conversation and order are restricted to this business."}</span></div>
        </>}
      </aside>
    </div>}
  </div>;
}
