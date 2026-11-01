"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, MessageCircle, Send } from "lucide-react";
import { api } from "../lib/api";

const supportKey = (slug) => `aura-store-support-${slug}`;

export function StoreSupportNotifications({ slug }) {
  const [unread, setUnread] = useState(false);
  const [details, setDetails] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let token = "";
    const refresh = async () => {
      token = window.localStorage.getItem(supportKey(slug)) || "";
      if (!token) {
        if (active) {
          setUnread(false);
          setDetails(null);
          setError("");
        }
        return;
      }
      try {
        const result = await api("/customer/store-support/notifications", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (active) {
          setUnread(result.unread);
          setDetails(result.unread ? result : null);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason.message);
      }
    };
    const timer = window.setInterval(refresh, 4000);
    window.addEventListener("storage", refresh);
    window.addEventListener("store-support-updated", refresh);
    refresh();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("store-support-updated", refresh);
    };
  }, [slug]);

  return <div className="store-notification-wrap">
    <button
      className="icon-button notification-button"
      type="button"
      aria-label={error ? "Support notification status unavailable" : unread ? "One unread Super Admin support reply" : "Notifications"}
      aria-expanded={open}
      title={error ? "Support notification status unavailable" : unread ? "New Super Admin support reply" : "Notifications"}
      onClick={() => setOpen((current) => !current)}
    >
      <Bell size={17} />{unread && <span className="notification-count">1</span>}
    </button>
    {open && <div className="notification-popover">
      <div className="notification-popover-heading"><b>Notifications</b>{unread && <span>New reply</span>}</div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      {details ? <a href="#platform-support" className="notification-entry" onClick={() => setOpen(false)}>
        <span className="notification-entry-icon"><MessageCircle size={15} /></span>
        <span><b>Super Admin replied</b><small>{details.lastMessage}</small></span>
        <i />
      </a> : !error && <p className="notification-empty">You’re all caught up.</p>}
    </div>}
  </div>;
}

export function StoreSupportChat({ slug }) {
  const [accessToken, setAccessToken] = useState("");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contact, setContact] = useState({ name: "", email: "" });
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(null);

  const loadConversation = useCallback(async (token) => {
    return api("/customer/store-support", {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAccessToken("");
    setConversation(null);
    setMessages([]);
    setContact({ name: "", email: "" });
    setError("");

    const savedToken = window.localStorage.getItem(supportKey(slug));
    if (!savedToken) {
      setLoading(false);
      return () => { active = false; };
    }

    setAccessToken(savedToken);
    loadConversation(savedToken)
      .then((result) => {
        if (!active) return;
        setConversation(result.conversation);
        setMessages(result.messages);
        setContact({ name: result.conversation.customerName, email: result.conversation.customerEmail });
        setError("");
      })
      .catch((reason) => {
        if (!active) return;
        window.localStorage.removeItem(supportKey(slug));
        setAccessToken("");
        setError(reason.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, loadConversation]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api("/customer/store-support", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (active) {
          setConversation(result.conversation);
          setMessages(result.messages);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason.message);
      }
    };
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [accessToken]);

  useEffect(() => {
    messagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function startConversation(event) {
    event.preventDefault();
    if (!contact.name.trim() || !contact.email.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/store/${encodeURIComponent(slug)}/support/conversations`, {
        method: "POST",
        body: JSON.stringify({ ...contact, body })
      });
      window.localStorage.setItem(supportKey(slug), result.accessToken);
      setAccessToken(result.accessToken);
      setConversation(result.conversation);
      setMessages([result.message]);
      setBody("");
      window.dispatchEvent(new Event("store-support-updated"));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!accessToken || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/customer/store-support/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ body })
      });
      setConversation(result.conversation);
      setMessages((current) => current.some((message) => message._id === result.message._id)
        ? current
        : [...current, result.message]);
      setBody("");
      window.dispatchEvent(new Event("store-support-updated"));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  function startNewConversation() {
    window.localStorage.removeItem(supportKey(slug));
    setAccessToken("");
    setConversation(null);
    setMessages([]);
    setBody("");
    setError("");
  }

  return <section className="store-customer-support store-platform-support">
    <div className="store-support-heading">
      <div>
        <p className="eyebrow">PLATFORM SUPPORT</p>
        <h2><MessageCircle size={18} /> Contact Super Admin</h2>
        <p>Send a message to the platform team. Replies appear here automatically.</p>
      </div>
      {conversation && <button type="button" className="button subtle compact" onClick={startNewConversation}>New request</button>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <p className="store-support-loading">Loading your support conversation…</p> : conversation ? <>
      <div className="store-support-order"><b>{conversation.customerName}</b><span>{conversation.status.replaceAll("_", " ")}</span></div>
      <div className="store-support-messages">
        {messages.map((message) => <article className={`store-support-message ${message.senderRole === "store_customer" ? "from-customer" : "from-business"}`} key={message._id}>
          <p>{message.body}</p>
          <small>{message.senderName} · {new Date(message.createdAt).toLocaleString()}{message.senderRole === "store_customer" && message.readAt ? " · Read" : ""}</small>
        </article>)}
        <div ref={messagesRef} />
      </div>
      <form className="store-support-composer" onSubmit={sendMessage}>
        <input aria-label="Message to Super Admin" maxLength="2000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message to platform support…" />
        <button className="button primary" disabled={busy || !body.trim()}><Send size={14} /> Send</button>
      </form>
    </> : <form className="store-platform-support-form" onSubmit={startConversation}>
      <label>Your name<input required minLength="2" maxLength="120" autoComplete="name" value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></label>
      <label>Email<input required type="email" maxLength="254" autoComplete="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label>
      <label className="store-platform-support-message">Message<textarea required minLength="1" maxLength="2000" rows="3" value={body} onChange={(event) => setBody(event.target.value)} placeholder="How can our platform support team help?" /></label>
      <button className="button primary" disabled={busy || !body.trim() || !contact.name.trim() || !contact.email.trim()}><Send size={14} /> {busy ? "Sending…" : "Send to Super Admin"}</button>
    </form>}
  </section>;
}
