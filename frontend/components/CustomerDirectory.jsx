"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Power, Search, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { api, money, shortDate } from "../lib/api";
import { LoadingState, MetricCard, PageHeader, Panel, StatusPill } from "./AppShell";

const emptySummary = {
  totalCustomers: 0,
  recentlyActiveCustomers: 0,
  disabledCustomers: 0,
  totalOrders: 0,
  recordedOrderValue: 0,
  pendingPaymentOrders: 0
};

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function CustomerDirectory({ role }) {
  const isAdmin = role === "super_admin";
  const endpoint = isAdmin ? "/admin/customers" : "/tenant/customers";
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (query) params.set("search", query);
      if (status !== "all") params.set("status", status);
      const result = await api(`${endpoint}?${params}`);
      setCustomers(result.items);
      setPages(result.pages);
      setTotal(result.total);
      if (isAdmin) setSummary(result.summary || emptySummary);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, isAdmin, page, query, status]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(customer) {
    const accountStatus = customer.accountStatus === "suspended" ? "active" : "suspended";
    setBusy(customer._id);
    setError("");
    try {
      await api(`/admin/customers/${customer._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ accountStatus })
      });
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  return <div className={`page-content${isAdmin ? " admin-customer-page" : ""}`}>
    <PageHeader
      eyebrow={isAdmin ? "PLATFORM ACCOUNTS" : "CUSTOMER RELATIONSHIPS"}
      title="Customers"
      description={isAdmin ? "Review registered customer accounts and manage their access." : "Customers who have placed orders with your company."}
    />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {isAdmin && <div className="metric-grid customer-metrics">
      <MetricCard label="Registered customers" value={summary.totalCustomers.toLocaleString()} note="Across all storefronts" icon={Users} />
      <MetricCard label="Active accounts" value={summary.recentlyActiveCustomers.toLocaleString()} note="Signed in within 7 days" icon={Check} tone="green" />
      <MetricCard label="Orders placed" value={summary.totalOrders.toLocaleString()} note={`${money(summary.recordedOrderValue)} recorded · ${summary.pendingPaymentOrders} payment${summary.pendingPaymentOrders === 1 ? "" : "s"} pending`} icon={ShoppingBag} tone="amber" />
      <MetricCard label="Disabled accounts" value={summary.disabledCustomers.toLocaleString()} note="Access revoked by admin" icon={Power} tone="red" />
    </div>}
    <Panel
      title={<>{isAdmin ? "Registered customers" : "Store customers"}<small className="customer-count">{total} {total === 1 ? "account" : "accounts"}</small></>}
      className={isAdmin ? "customer-directory-panel" : ""}
      action={<div className="customer-directory-controls">
        <form className="table-search" onSubmit={submitSearch}><Search size={15} /><input aria-label="Search customers" placeholder="Search name, email or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></form>
        <select aria-label="Account status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Disabled</option></select>
      </div>}
    >
      {loading && !customers.length ? <LoadingState /> : error && !customers.length ? <LoadingState error={error} retry={load} /> : <>
        <div className="table-wrap customer-table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>ORDER HISTORY</th><th>REGISTERED</th><th>LAST LOGIN</th><th>STATUS</th>{isAdmin && <th>ACCESS</th>}</tr></thead><tbody>
          {customers.map((customer) => <tr key={customer._id}>
            <td><div className="customer-identity"><span className="avatar gold">{initials(customer.name)}</span><div><b>{customer.name}</b><small className="table-subline">{customer.email}</small></div></div></td>
            <td className="customer-phone">{customer.phone || "Not provided"}</td>
            <td><b>{customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}{isAdmin && customer.orderCount > 0 ? ` · ${money(customer.recordedOrderValue)}` : ""}</b>{(isAdmin ? customer.orders?.slice(0, 2) : customer.orders)?.map((order) => <small className="table-subline customer-order-line" key={order._id}>{order.orderNumber} · {money(order.total)} · {shortDate(order.createdAt)}{isAdmin && order.tenantId?.name ? ` · ${order.tenantId.name}` : ""}</small>)}</td>
            <td>{shortDate(customer.createdAt)}</td>
            <td>{customer.lastLoginAt ? shortDate(customer.lastLoginAt) : "Never"}</td>
            <td><StatusPill tone={customer.accountStatus}>{customer.accountStatus === "suspended" ? "Disabled" : "Active"}</StatusPill></td>
            {isAdmin && <td><button className={`icon-button customer-access-button ${customer.accountStatus === "active" ? "danger-action" : "success-action"}`} type="button" title={customer.accountStatus === "active" ? "Disable account" : "Enable account"} aria-label={customer.accountStatus === "active" ? `Disable account for ${customer.name}` : `Enable account for ${customer.name}`} disabled={busy === customer._id} onClick={() => changeStatus(customer)}><Power size={15} /></button></td>}
          </tr>)}
          {!customers.length && <tr><td className="empty-table" colSpan={isAdmin ? 7 : 6}>No customers match this search.</td></tr>}
        </tbody></table></div>
        {(isAdmin || pages > 1) && <div className="pagination-row"><span>{isAdmin ? `Showing ${total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total} customers` : "0 customers"}` : `Page ${page} of ${pages}`}</span><div><button className="button subtle compact" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {Math.max(pages, 1)}</span><button className="button subtle compact" type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </>}
    </Panel>
    {isAdmin && <div className="note customer-access-note"><ShieldCheck size={16} /><span>Disabling a customer blocks storefront sign-in across every tenant. Their orders stay with each business, and the change is written to the audit log.</span></div>}
  </div>;
}