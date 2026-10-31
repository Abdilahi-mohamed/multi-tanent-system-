"use client";

import { useCallback, useEffect, useState } from "react";
import { api, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, Panel } from "../../../components/AppShell";

export default function AuditPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/admin/audit").then((result) => setItems(result.items)).catch((reason) => setError(reason.message)), []);
  useEffect(() => { load(); }, [load]);
  return <div className="page-content"><PageHeader eyebrow="SECURITY & MAINTENANCE" title="Audit log" description="Traceable records of sensitive platform and tenant operations." />
    <Panel title="Administrative events">{error ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>ACTOR</th><th>TARGET</th><th>DATE</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td><b>{item.action}</b></td><td>{item.actorId?.name || "Platform user"}<small className="table-subline">{item.actorRole}</small></td><td>{item.targetType} · {item.targetId}</td><td>{shortDate(item.createdAt)}</td></tr>)}{!items.length && <tr><td colSpan="4" className="empty-table">No administrative events have been recorded.</td></tr>}</tbody></table></div>}</Panel>
  </div>;
}
