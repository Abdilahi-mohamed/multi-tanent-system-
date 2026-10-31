"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp, MessageCircle, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { api, shortDate } from "../lib/api";
import { LoadingState, PageHeader, StatusPill } from "./AppShell";

const statusLabels = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved"
};

function initials(value = "") {
  return value.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function SupportChat({ role }) {
  const isAdmin = role === "super_admin";
  const listPath = isAdmin ? "/admin/support/conversations" : "/tenant/support/conversations";
  const conversationPath = isAdmin ? "/admin/support/conversations" : "/tenant/support/conversations";
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [threadRetry, setThreadRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const listUrl = `${listPath}?page=${page}&limit=50${statusFilter === "all" ? "" : `&status=${statusFilter}`}`;

  const loadConversations = useCallback(async () => {
    try {
      const result = await api(listUrl);
      setConversations(result.items);
      setPages(Math.max(result.pages || 1, 1));
      setTotal(result.total || 0);
      setSelectedId((current) => current && result.items.some((item) => item._id === current)
        ? current
        : starting ? "" : result.items[0]?._id || "");
      setListError("");
    } catch (reason) {
      setListError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [listUrl, starting]);

  useEffect(() => {
    loadConversations();
    const timer = window.setInterval(loadConversations, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setThreadError("");
      return undefined;
    }
    setThread(null);
    setThreadError("");
    let active = true;
    const loadThread = async () => {
      try {
        const result = await api(`${conversationPath}/${selectedId}`);
        if (active) {
          setThread(result);
          setThreadError("");
          const unreadField = isAdmin ? "unreadByAdmin" : "unreadByBusiness";
          setConversations((current) => current.map((item) => item._id === selectedId ? { ...item, [unreadField]: false } : item));
        }
      } catch (reason) {
        if (active) setThreadError(reason.message);
      }
    };
    loadThread();
    const timer = window.setInterval(loadThread, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [conversationPath, selectedId, threadRetry]);

  const visible = useMemo(() => conversations.filter((conversation) => {
    const businessName = conversation.tenantId?.name || "";
    const senderName = conversation.createdBy?.name || "";
    const matchesSearch = `${businessName} ${senderName} ${conversation.createdBy?.username || ""} ${conversation.subject} ${conversation.lastMessage}`
      .toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (statusFilter === "all" || conversation.status === statusFilter);
  }), [conversations, search, statusFilter]);
  const selectedSummary = conversations.find((conversation) => conversation._id === selectedId);

  async function createConversation(event) {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setThreadError("");
    try {
      const result = await api(listPath, {
        method: "POST",
        body: JSON.stringify({ subject, body })
      });
      setSubject("");
      setBody("");
      setStarting(false);
      setPage(1);
      setStatusFilter("all");
      setThread({ conversation: result.conversation, messages: [result.message] });
      setSelectedId(result.conversation._id);
    } catch (reason) {
      setThreadError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!body.trim() || !selectedId) return;
    setBusy(true);
    setThreadError("");
    try {
      const result = await api(`${conversationPath}/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body })
      });
      setBody("");
      setThread((current) => current ? {
        conversation: { ...current.conversation, ...result.conversation, tenantId: current.conversation.tenantId, createdBy: current.conversation.createdBy },
        messages: current.messages.some((message) => message._id === result.message._id)
          ? current.messages
          : [...current.messages, result.message]
      } : current);
      await loadConversations();
    } catch (reason) {
      setThreadError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status) {
    if (!selectedId) return;
    setBusy(true);
    setThreadError("");
    try {
      const result = await api(`${conversationPath}/${selectedId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setThread((current) => current ? {
        ...current,
        conversation: { ...current.conversation, ...result.conversation, tenantId: current.conversation.tenantId, createdBy: current.conversation.createdBy }
      } : current);
      await loadConversations();
    } catch (reason) {
      setThreadError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  const conversation = thread?.conversation;
  const messages = thread?.messages || [];
  const title = isAdmin ? "Customer Support Inbox" : "Customer Support / Chat";

  return <div className="page-content chat-page">
    <PageHeader
      eyebrow={isAdmin ? "BUSINESS SUPPORT" : "CUSTOMER SUPPORT"}
      title={title}
      description={isAdmin
        ? "Read and respond to support requests from registered business accounts."
        : "Send a private support request to the platform team and follow its status."}
      actions={isAdmin
        ? <button className="button subtle compact" onClick={loadConversations}><RefreshCw size={14} /> Refresh</button>
        : <button className="button primary compact" onClick={() => { setStarting(true); setSelectedId(""); setThread(null); setThreadError(""); }}><Plus size={14} /> New conversation</button>}
    />
    {listError && conversations.length > 0 && <p className="inline-error support-thread-error" role="alert">{listError}</p>}
    {listError && !conversations.length
      ? <LoadingState error={listError} retry={loadConversations} />
      : <div className="chat-layout support-chat-layout">
        <aside className="chat-list-panel">
          <div className="chat-list-title"><b>Conversations</b><span>{total}</span></div>
          <input className="chat-search" aria-label="Search conversations" placeholder={isAdmin ? "Search business or sender…" : "Search requests…"} value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="chat-filters">
            {["all", "open", "in_progress", "resolved"].map((status) => <button type="button" className={statusFilter === status ? "active" : ""} key={status} onClick={() => { setStatusFilter(status); setPage(1); }}>{status === "all" ? "All" : statusLabels[status]}{status === "all" ? ` (${total})` : ""}</button>)}
          </div>
          <div className="conversation-list">
            {visible.map((item) => <button type="button" className={`conversation-item ${selectedId === item._id ? "selected" : ""}`} onClick={() => { setStarting(false); setSelectedId(item._id); }} key={item._id}>
              <span className="avatar conversation-avatar">{initials(isAdmin ? item.tenantId?.name : item.subject)}</span>
              <div>
                <div className="conversation-meta"><b>{isAdmin ? item.tenantId?.name || "Business" : item.subject}</b><small>{shortDate(item.lastMessageAt)}</small></div>
                <p>{item.lastMessage}</p>
                <div className="support-conversation-meta"><small>{isAdmin ? item.createdBy?.name || "Business user" : item.subject}</small><StatusPill tone={item.status}>{statusLabels[item.status] || item.status}</StatusPill>{(isAdmin ? item.unreadByAdmin : item.unreadByBusiness) && <i className="support-unread-dot" aria-label="Unread message" />}</div>
              </div>
            </button>)}
            {!visible.length && <div className="empty-state">{loading ? "Loading conversations…" : conversations.length ? "No conversations match these filters." : isAdmin ? "Business support requests will appear here." : "You have no support conversations yet."}</div>}
          </div>
          {pages > 1 && <div className="support-pagination"><button className="button subtle compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="button subtle compact" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
        </aside>
        {starting && !isAdmin
          ? <section className="chat-thread support-new-thread">
            <header className="thread-header"><span className="avatar"><CircleHelp size={17} /></span><div><b>New support request</b><small>Only your business and the platform support team can see this conversation.</small></div></header>
            <form className="support-new-form" onSubmit={createConversation}>
              <label>Subject<input required minLength="2" maxLength="120" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the issue" /></label>
              <label>Your message<textarea required minLength="1" maxLength="2000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell us what happened and how we can help." /></label>
              {threadError && <p className="inline-error" role="alert">{threadError}</p>}
              <div className="user-form-footer"><button type="button" className="button subtle" onClick={() => { setStarting(false); setBody(""); setSubject(""); }}>Cancel</button><button className="button primary" disabled={busy || !body.trim() || !subject.trim()}><Send size={14} /> {busy ? "Sending…" : "Send request"}</button></div>
            </form>
          </section>
          : conversation ? <section className="chat-thread">
            <header className="thread-header">
              <span className="avatar">{initials(isAdmin ? conversation.tenantId?.name : conversation.subject)}</span>
              <div><b>{conversation.subject}</b><small>{isAdmin ? `${conversation.tenantId?.name || "Business"} · ${conversation.createdBy?.name || "Business user"}` : "Platform support"} · Created {shortDate(conversation.createdAt)}</small></div>
              {isAdmin
                ? <select aria-label="Conversation status" value={conversation.status} disabled={busy} onChange={(event) => updateStatus(event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>
                : <StatusPill tone={conversation.status}>{statusLabels[conversation.status] || conversation.status}</StatusPill>}
            </header>
            {threadError && <p className="inline-error support-thread-error" role="alert">{threadError}</p>}
            <div className="thread-messages">
              {messages.map((message) => {
                const ownMessage = message.senderRole === (isAdmin ? "super_admin" : "business_owner");
                return <div className={`message-row ${ownMessage ? "from-merchant" : ""}`} key={message._id}>
                  <div className="message-bubble"><p>{message.body}</p><small>{message.senderName} · {new Date(message.createdAt).toLocaleString()}{ownMessage && ` · ${message.readAt ? "Read" : "Sent"}`}</small></div>
                </div>;
              })}
              {!messages.length && !threadError && <div className="empty-state">Loading conversation history…</div>}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <input aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={isAdmin ? "Reply to this business…" : "Reply to platform support…"} />
              <button className="button primary" disabled={busy || !body.trim()}><Send size={15} /> Send</button>
            </form>
          </section>
          : <section className="chat-thread chat-empty">{threadError && selectedId && <p className="inline-error" role="alert">{threadError} <button className="text-link" onClick={() => setThreadRetry((current) => current + 1)}>Retry</button></p>}<MessageCircle size={32} /><b>{isAdmin ? "Select a support request" : "Start a support conversation"}</b><p>{isAdmin ? "Choose a business conversation to review its messages and respond." : "Your support history and replies will appear here."}</p>{!isAdmin && <button className="button primary" onClick={() => setStarting(true)}><Plus size={14} /> New conversation</button>}</section>}
        <aside className="customer-dossier support-dossier">
          <div className="dossier-heading">{isAdmin ? "BUSINESS & SENDER" : "SUPPORT DETAILS"}</div>
          {conversation ? <>
            <div className="dossier-profile"><span className="avatar large">{initials(isAdmin ? conversation.tenantId?.name : conversation.createdBy?.name)}</span><div><b>{isAdmin ? conversation.tenantId?.name : conversation.subject}</b><small>{isAdmin ? conversation.createdBy?.name : "Platform support"}</small></div></div>
            <div className="dossier-order">
              <h3>Conversation details</h3>
              <div className="dossier-info"><span>Status</span><StatusPill tone={conversation.status}>{statusLabels[conversation.status] || conversation.status}</StatusPill></div>
              <div className="dossier-info"><span>Created</span><b>{shortDate(conversation.createdAt)}</b></div>
              {isAdmin && <>
                <div className="dossier-info"><span>Business ID</span><b>{String(conversation.tenantId?._id || "")}</b></div>
                <div className="dossier-info"><span>Sender ID</span><b>{String(conversation.createdBy?._id || "")}</b></div>
                <div className="dossier-info"><span>Login</span><b>{conversation.createdBy?.username || conversation.createdBy?.email}</b></div>
              </>}
            </div>
            <div className="security-note"><ShieldCheck size={16} /><span>This conversation is private to its registered business and the platform support team.</span></div>
          </> : <div className="empty-state">Select a conversation to view its details.</div>}
        </aside>
      </div>}
    {selectedSummary && isAdmin && <span className="sr-only">Selected support conversation: {selectedSummary.subject}</span>}
  </div>;
}
