"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LogOut, PackageCheck } from "lucide-react";
import { api, money, shortDate } from "../../../lib/api";
import { StatusPill } from "../../../components/AppShell";

export default function CustomerOrdersPage() {
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    const authError = new URLSearchParams(window.location.search).get("customerAuthError");
    try {
      const [account, history] = await Promise.all([
        api("/customer/auth/me"),
        api("/customer/orders")
      ]);
      setCustomer(account.customer);
      setOrders(history.orders);
    } catch (reason) {
      setError(authError === "google_not_configured"
        ? "Google sign-in is not configured for this store yet."
        : authError
          ? "Google sign-in could not be completed. Please try again."
          : reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function signOut() {
    try {
      await api("/customer/auth/logout", { method: "POST" });
      window.location.assign("/customer/login");
    } catch (reason) {
      setError(reason.message);
    }
  }

  return <main className="customer-orders-page">
    <header className="customer-orders-header"><Link href="/customer/orders" className="store-brand"><span className="brand-mark"><Image src="/vendora-mark.png" alt="" width={36} height={36} /></span><b>Vendora</b></Link><div>{customer && <><span>{customer.name}</span><button className="button subtle compact" type="button" onClick={signOut}><LogOut size={14} /> Sign out</button></>}</div></header>
    <section className="customer-orders-content">
      {orders[0]?.tenantId?.slug && <Link href={`/store/${encodeURIComponent(orders[0].tenantId.slug)}`} className="text-link"><ArrowLeft size={14} /> Continue shopping at {orders[0].tenantId.name}</Link>}
      <h1>My orders</h1>
      <p>Order history and fulfillment status for your customer account.</p>
      {error && <div className="customer-orders-error" role="alert">{error}{error.includes("Sign in") && <Link href="/customer/login?returnTo=%2Fcustomer%2Forders">Sign in</Link>}<button type="button" className="text-link" onClick={loadOrders}>Try again</button></div>}
      {loading ? <div className="customer-orders-empty">Loading your orders…</div> : orders.length ? <div className="customer-orders-list">
        {orders.map((order) => <article className="customer-order-card" key={order._id}>
          <div className="customer-order-heading"><div><small>{order.tenantId?.name || "Store"} · {shortDate(order.createdAt)}</small><h2>{order.orderNumber}</h2></div><StatusPill tone={order.fulfillmentStatus}>{order.fulfillmentStatus.replaceAll("_", " ")}</StatusPill></div>
          <div className="customer-order-items">{(order.items?.length ? order.items : [order.item]).map((item, index) => <div className="customer-order-item" key={`${item.productId}-${index}`}><PackageCheck size={16} /><span><b>{item.name}</b><small>{item.variant || "Standard"} · Qty {item.quantity}</small></span><strong>{money(item.lineTotal ?? item.unitPrice * item.quantity)}</strong></div>)}</div>
          <div className="customer-order-footer"><span>Payment · <StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></span><b>Total {money(order.total)}</b><span>{order.paymentMethod.replaceAll("_", " ")}</span>{order.tenantId?.slug && <Link className="text-link" href={`/store/${encodeURIComponent(order.tenantId.slug)}`}>Shop this store</Link>}</div>
        </article>)}
      </div> : !error && <div className="customer-orders-empty">No orders yet. Browse a store and sign in at checkout to place your first order.</div>}
    </section>
  </main>;
}
