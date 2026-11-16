"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { api } from "../../../lib/api";
import { LoadingState, PageHeader, Panel } from "../../../components/AppShell";

const pageSize = 10;
const categories = ["All", "Orders", "Products", "Support", "Business"];

function categoryFor(item) {
  const target = String(item.targetType || "").toLowerCase();
  if (target.includes("order")) return "Orders";
  if (target.includes("product")) return "Products";
  if (target.includes("support") || target.includes("conversation")) return "Support";
  return "Business";
}

function eventLabel(action) {
  return String(action || "Unknown event")
    .split(/[._]/)
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
    .join(" ");
}

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function displayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "Unknown date", time: "" };
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  };
}

export default function AuditPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [range, setRange] = useState("30");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    return api("/admin/audit")
      .then((result) => {
        setItems(result.items);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, category, range]);

  const dateFilteredItems = useMemo(() => {
    const earliest = range === "all" ? 0 : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    return items.filter((item) => {
      const timestamp = new Date(item.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= earliest;
    });
  }, [items, range]);

  const counts = useMemo(() => dateFilteredItems.reduce((result, item) => {
    const itemCategory = categoryFor(item);
    result.All += 1;
    result[itemCategory] += 1;
    return result;
  }, { All: 0, Orders: 0, Products: 0, Support: 0, Business: 0 }), [dateFilteredItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dateFilteredItems.filter((item) => {
      if (category !== "All" && categoryFor(item) !== category) return false;
      if (!query) return true;
      const text = [
        item.action,
        item.targetType,
        item.targetId,
        item.actorId?.name,
        item.actorId?.email,
        item.actorRole
      ].join(" ").toLowerCase();
      return text.includes(query);
    });
  }, [category, dateFilteredItems, search]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  function exportCsv() {
    const rows = [
      ["Event", "Category", "Actor", "Actor email", "Actor role", "Target type", "Target ID", "Date"],
      ...filteredItems.map((item) => [
        eventLabel(item.action),
        categoryFor(item),
        item.actorId?.name || "Platform user",
        item.actorId?.email || "",
        item.actorRole || "",
        item.targetType || "",
        item.targetId || "",
        item.createdAt || ""
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vendora-audit-log.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="page-content audit-page">
    <PageHeader eyebrow="SECURITY & MAINTENANCE" title="Audit log" description="Traceable records of sensitive platform and tenant operations." />
    <Panel
      title={<>Administrative events <small className="audit-total">{filteredItems.length} shown</small></>}
      className="audit-panel"
      action={<button className="button subtle compact" type="button" onClick={exportCsv} disabled={!filteredItems.length}><Download size={15} /> Export CSV</button>}
    >
      <div className="audit-toolbar">
        <div className="audit-tabs" role="tablist" aria-label="Filter audit events by category">
          {categories.map((name) => <button
            type="button"
            role="tab"
            aria-selected={category === name}
            className={category === name ? "active" : ""}
            key={name}
            onClick={() => setCategory(name)}
          >{name}<span>{counts[name]}</span></button>)}
        </div>
        <div className="audit-filters">
          <label className="table-search"><Search size={15} /><input placeholder="Search events, actors, or targets" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Filter by date range" value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All available dates</option>
          </select>
        </div>
      </div>
      {loading && !items.length ? <LoadingState /> : error ? <LoadingState error={error} retry={load} /> : <>
        <div className="table-wrap audit-table-wrap"><table className="audit-table"><thead><tr><th>EVENT</th><th>CATEGORY</th><th>ACTOR</th><th>TARGET</th><th>DATE</th></tr></thead><tbody>
          {visibleItems.map((item) => {
            const date = displayDate(item.createdAt);
            return <tr key={item._id}>
              <td><b className="audit-event">{eventLabel(item.action)}</b></td>
              <td><span className={`audit-category ${categoryFor(item).toLowerCase()}`}>{categoryFor(item)}</span></td>
              <td><b>{item.actorId?.name || "Platform user"}</b><small className="table-subline">{item.actorRole || item.actorId?.email || "—"}</small></td>
              <td><b>{item.targetType || "Unknown target"}</b><small className="table-subline mono">{item.targetId || "—"}</small></td>
              <td><b>{date.date}</b><small className="table-subline">{date.time}</small></td>
            </tr>;
          })}
          {!visibleItems.length && <tr><td colSpan="5" className="empty-table">No audit events match these filters.</td></tr>}
        </tbody></table></div>
        <div className="panel-footer audit-pagination">
          <span>Showing {filteredItems.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredItems.length)} of ${filteredItems.length} events` : "0 events"}{items.length >= 100 ? " · Latest 100 records only" : ""}</span>
          <div><button className="button subtle compact" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="button subtle compact" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
        </div>
      </>}
    </Panel>
  </div>;
}
