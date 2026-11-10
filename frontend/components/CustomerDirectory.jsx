"use client";

import { useCallback, useEffect, useState } from "react";
import { Power, Search } from "lucide-react";
import { api, money, shortDate } from "../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "./AppShell";

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
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, query, status]);

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

  return <div className="page-content">
    <PageHeader
      eyebrow={isAdmin ? "PLATFORM ACCOUNTS" : "CUSTOMER RELATIONSHIPS"}
      title="Customers"
      description={isAdmin ? "Review registered customer accounts and manage their access." : "Customers who have placed orders with your company."}
    />
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Panel title={`${isAdmin ? "Registered customers" : "Store customers"} · ${total}`} action={<div className="filter-actions">
      <form className="table-search" onSubmit={submitSearch}><Search size={15} /><input aria-label="Search customers" placeholder="Search name, email or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></form>
      <select aria-label="Account status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
    </div>}>
      {loading && !customers.length ? <LoadingState /> : error && !customers.length ? <LoadingState error={error} retry={load} /> : <>
        <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>ORDER HISTORY</th><th>REGISTERED</th><th>LAST LOGIN</th><th>STATUS</th>{isAdmin && <th />}</tr></thead><tbody>
          {customers.map((customer) => <tr key={customer._id}>
            <td><b>{customer.name}</b><small className="table-subline">{customer.email}</small></td>
            <td>{customer.phone || "Not provided"}</td>
            <td><b>{customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}</b>{customer.orders?.map((order) => <small className="table-subline" key={order._id}>{order.orderNumber} · {money(order.total)} · {shortDate(order.createdAt)}{isAdmin && order.tenantId?.name ? ` · ${order.tenantId.name}` : ""}</small>)}</td>
            <td>{shortDate(customer.createdAt)}</td>
            <td>{customer.lastLoginAt ? shortDate(customer.lastLoginAt) : "Never"}</td>
            <td><StatusPill tone={customer.accountStatus}>{customer.accountStatus}</StatusPill></td>
            {isAdmin && <td><button className={`icon-button ${customer.accountStatus === "active" ? "danger-action" : ""}`} type="button" title={customer.accountStatus === "active" ? "Suspend customer" : "Reactivate customer"} aria-label={customer.accountStatus === "active" ? `Suspend ${customer.name}` : `Reactivate ${customer.name}`} disabled={busy === customer._id} onClick={() => changeStatus(customer)}><Power size={15} /></button></td>}
          </tr>)}
          {!customers.length && <tr><td className="empty-table" colSpan={isAdmin ? 7 : 6}>No customers match this search.</td></tr>}
        </tbody></table></div>
        {pages > 1 && <div className="pagination-row"><span>Page {page} of {pages}</span><div><button className="button subtle compact" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="button subtle compact" type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </>}
    </Panel>
  </div>;
}