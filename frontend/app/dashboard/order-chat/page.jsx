"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { api, money, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, StatusPill } from "../../../components/AppShell";

export default function OrderChatPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const result = await api("/tenant/conversations");
      setConversations(result.items);
      setSelectedId((current) => current && result.items.some((item) => item._id === current) ? current : result.items[0]?._id || "");
      setError("");
    } catch (reason) { setError(reason.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const selected = conversations.find((item) => item._id === selectedId);
  const visible = conversations.filter((item) => `${item.customerName} ${item.customerPhone} ${item.orderId?.orderNumber}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selected?.messages?.length]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!body.trim() || !selected) return;
    setBusy(true);
    try {
      await api(`/tenant/conversations/${selected._id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return <div className="page-content chat-page">
    <PageHeader eyebrow="CUSTOMER COMMUNICATIONS" title="Order chat & fulfillment dispatch" description="Customer conversations created from this tenant’s orders." actions={<><a className="button subtle compact" href="/dashboard/support">Contact Super Admin</a><button className="button subtle compact" onClick={load}><RefreshCw size={14} /> Refresh</button></>} />
    {error && !conversations.length ? <LoadingState error={error} retry={load} /> : <div className="chat-layout">
      <aside className="chat-list-panel"><div className="chat-list-title"><b>Conversations</b><span>{conversations.length}</span></div><input className="chat-search" placeholder="Search customer or order…" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="chat-filters"><span className="active">All ({conversations.length})</span><span>Orders ({conversations.length})</span></div>
        <div className="conversation-list">{visible.map((conversation) => <button className={`conversation-item ${selectedId === conversation._id ? "selected" : ""}`} onClick={() => setSelectedId(conversation._id)} key={conversation._id}><span className="avatar conversation-avatar">{conversation.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><div className="conversation-meta"><b>{conversation.customerName}</b><small>{shortDate(conversation.updatedAt)}</small></div><p>{conversation.messages.at(-1)?.body || "Order conversation created"}</p><small>{conversation.orderId?.orderNumber || "Order"}</small></div></button>)}
        {!visible.length && <div className="empty-state">{conversations.length ? "No conversation matches your search." : "New order conversations will appear here."}</div>}</div>
      </aside>
      {selected ? <section className="chat-thread"><header className="thread-header"><span className="avatar">{selected.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><b>{selected.customerName}</b><small>{selected.customerPhone} · {selected.orderId?.orderNumber}</small></div><StatusPill tone={selected.orderId?.paymentStatus}>{selected.orderId?.paymentStatus || "order"}</StatusPill></header>
        <div className="thread-messages">{selected.messages.map((message) => <div className={`message-row ${message.sender === "merchant" ? "from-merchant" : ""}`} key={message._id}><div className="message-bubble"><p>{message.body}</p><small>{message.sender === "merchant" ? "You" : selected.customerName} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div></div>)}<div ref={bottomRef} /></div>
        <form className="composer" onSubmit={sendMessage}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={`Reply to ${selected.customerName}…`} /><button className="button primary" disabled={busy || !body.trim()}><Send size={15} /> Send</button></form>
      </section> : <section className="chat-thread chat-empty"><MessageCircle size={32} /><b>Select a conversation</b><p>Customer chats are isolated to this business.</p></section>}
      <aside className="customer-dossier"><div className="dossier-heading">CUSTOMER DOSSIER</div>{selected && <><div className="dossier-profile"><span className="avatar large">{selected.customerName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><b>{selected.customerName}</b><small>{selected.customerPhone}</small></div></div><div className="dossier-order"><h3>Order summary</h3><div className="dossier-item"><div><b>{selected.orderId?.item?.name || "Order item"}</b><small>{selected.orderId?.item?.variant} × {selected.orderId?.item?.quantity}</small></div><b>{money(selected.orderId?.total)}</b></div><div className="dossier-info"><span>Order</span><b>{selected.orderId?.orderNumber}</b></div><div className="dossier-info"><span>Payment</span><StatusPill tone={selected.orderId?.paymentStatus}>{selected.orderId?.paymentStatus || "unknown"}</StatusPill></div><div className="dossier-info"><span>Fulfillment</span><StatusPill tone={selected.orderId?.fulfillmentStatus}>{selected.orderId?.fulfillmentStatus || "unknown"}</StatusPill></div><div className="dossier-address">{selected.orderId?.customer?.address}</div></div><div className="security-note"><ShieldCheck size={16} /><span>Conversation belongs to this tenant and its linked order.</span></div></>}</aside>
    </div>}
  </div>;
}
