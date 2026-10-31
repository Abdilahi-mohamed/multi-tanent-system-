"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, KeyRound, Pencil, Plus, Search, X } from "lucide-react";
import { api, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const emptyCompany = {
  name: "", slug: "", ownerName: "", email: "", phone: "", category: "Retail", description: "",
  username: "", password: "", confirmPassword: "", subscriptionFee: "", billingCurrency: "USD",
  billingFrequency: "monthly", status: "active"
};

function slugFromName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-+$/g, "");
}

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyCompany);
  const [slugEdited, setSlugEdited] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(() => api(`/admin/businesses?limit=100&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`)
    .then((result) => { setBusinesses(result.items); setError(""); }).catch((reason) => setError(reason.message)), [search, status]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedStatus = query.get("status");
    const requestedSearch = query.get("search");
    if (["pending", "active", "suspended", "rejected"].includes(requestedStatus)) setStatus(requestedStatus);
    if (requestedSearch) setSearch(requestedSearch);
  }, []);
  useEffect(() => { load(); }, [load]);

  function updateCreateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: slugFromName(value) } : {})
    }));
  }

  async function createCompany(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.password !== form.confirmPassword) {
      setError("Administrator passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await api("/admin/businesses", {
        method: "POST",
        body: JSON.stringify({ ...form, subscriptionFee: Number(form.subscriptionFee) })
      });
      setForm(emptyCompany);
      setSlugEdited(false);
      setCreating(false);
      setSuccess("Company and administrator account created. The administrator can now sign in.");
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditing(business) {
    setEditing(business._id);
    setEditForm({
      name: business.name,
      slug: business.slug,
      ownerName: business.ownerName,
      email: business.email,
      phone: business.phone || "",
      category: business.category || "Retail",
      description: business.description || "",
      subscriptionFee: business.subscriptionFee == null ? "" : String(business.subscriptionFee),
      billingCurrency: business.billingCurrency || "",
      billingFrequency: business.billingFrequency || ""
    });
    setError("");
    setSuccess("");
  }

  async function saveCompany(event) {
    event.preventDefault();
    setBusy(editing);
    setError("");
    try {
      const { subscriptionFee, billingCurrency, billingFrequency, ...company } = editForm;
      await api(`/admin/businesses/${editing}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...company,
          ...(subscriptionFee !== "" ? { subscriptionFee: Number(subscriptionFee) } : {}),
          ...(billingCurrency ? { billingCurrency } : {}),
          ...(billingFrequency ? { billingFrequency } : {})
        })
      });
      setEditing(null);
      setEditForm(null);
      setSuccess("Company information updated.");
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(id, nextStatus) {
    if (!window.confirm(`Confirm changing this business to ${nextStatus}?`)) return;
    setBusy(id);
    setError("");
    try {
      await api(`/admin/businesses/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  }

  return <div className="page-content">
    <PageHeader
      eyebrow="BUSINESS MANAGEMENT"
      title="All Businesses"
      description="Create business accounts with owner access and billing terms, edit business information, and manage platform access."
      actions={<button className="button primary" onClick={() => { setCreating(!creating); setError(""); setSuccess(""); }}><Plus size={15} /> {creating ? "Close form" : "Create company"}</button>}
    />

    {success && <p className="user-success" role="status">{success}</p>}
    {error && <p className="inline-error user-message" role="alert">{error}</p>}

    {creating && <Panel title="New company and administrator">
      <form className="user-create-form" onSubmit={createCompany}>
        <div className="user-form-section"><Building2 size={15} /><b>Company information</b></div>
        <div className="form-grid">
          <label>Company name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => updateCreateField("name", event.target.value)} /></label>
          <label>Store address<input required minLength="2" maxLength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => { setSlugEdited(true); updateCreateField("slug", slugFromName(event.target.value)); }} /><small>Lowercase letters, numbers, and hyphens.</small></label>
          <label>Owner name<input required minLength="2" maxLength="120" value={form.ownerName} onChange={(event) => updateCreateField("ownerName", event.target.value)} /></label>
          <label>Company contact email<input required type="email" maxLength="254" value={form.email} onChange={(event) => updateCreateField("email", event.target.value)} /></label>
          <label>Phone<input maxLength="40" value={form.phone} onChange={(event) => updateCreateField("phone", event.target.value)} /></label>
          <label>Category<input required minLength="2" maxLength="80" value={form.category} onChange={(event) => updateCreateField("category", event.target.value)} /></label>
          <label className="form-field-wide">Description<textarea maxLength="1000" value={form.description} onChange={(event) => updateCreateField("description", event.target.value)} /></label>
        </div>
        <div className="user-form-section user-form-section-spaced"><Building2 size={15} /><b>Subscription billing</b></div>
        <div className="form-grid">
          <label>Subscription fee / rental amount<input required type="number" min="0" max="1000000000000" step="0.01" value={form.subscriptionFee} onChange={(event) => updateCreateField("subscriptionFee", event.target.value)} /></label>
          <label>Billing currency<input required minLength="3" maxLength="3" pattern="[A-Za-z]{3}" value={form.billingCurrency} onChange={(event) => updateCreateField("billingCurrency", event.target.value.toUpperCase())} /><small>Enter a three-letter currency code, such as USD or SOS.</small></label>
          <label>Billing frequency<select required value={form.billingFrequency} onChange={(event) => updateCreateField("billingFrequency", event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          <label>Account status<select required value={form.status} onChange={(event) => updateCreateField("status", event.target.value)}><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></label>
        </div>
        <div className="user-form-section user-form-section-spaced"><KeyRound size={15} /><b>Company administrator credentials</b></div>
        <div className="form-grid">
          <label>Username<input required minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" autoCapitalize="none" autoComplete="off" value={form.username} onChange={(event) => updateCreateField("username", event.target.value)} /></label>
          <label>Password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => updateCreateField("password", event.target.value)} /></label>
          <label>Confirm password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateCreateField("confirmPassword", event.target.value)} /></label>
        </div>
        <div className="user-form-footer"><span>Business owners sign in with their username and password. Pending or suspended businesses cannot sign in.</span><button className="button primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create business account"}</button></div>
      </form>
    </Panel>}

    <Panel title="Business directory" action={<div className="filter-actions"><label className="table-search"><Search size={15} /><input placeholder="Search business or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></div>}>
      {error && !businesses.length ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>OWNER & CONTACT</th><th>CATEGORY</th><th>SUBSCRIPTION</th><th>REGISTERED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
        {businesses.map((business) => <tr key={business._id}>
          <td><div className="business-cell"><span className="square-logo">{business.name.slice(0, 2).toUpperCase()}</span><div><b>{business.name}</b><small>{business.slug}</small></div></div></td>
          <td>{business.ownerName}<small className="table-subline">{business.email}</small></td><td>{business.category}</td><td>{business.subscriptionFee == null || !business.billingCurrency || !business.billingFrequency ? "Not configured" : new Intl.NumberFormat("en-US", { style: "currency", currency: business.billingCurrency }).format(business.subscriptionFee)}{business.billingFrequency && <small className="table-subline">{business.billingFrequency}</small>}</td><td>{shortDate(business.createdAt)}</td>
          <td><StatusPill tone={business.status}>{business.status}</StatusPill></td>
          <td><div className="row-actions">
            <button className="icon-button" disabled={busy === business._id} onClick={() => startEditing(business)} aria-label={`Edit ${business.name}`} title="Edit company"><Pencil size={15} /></button>
            {business.status !== "active" && <button className="icon-button success-action" disabled={busy === business._id} onClick={() => changeStatus(business._id, "active")} aria-label="Approve or reactivate"><Check size={16} /></button>}
            {business.status !== "suspended" && business.status !== "rejected" && <button className="icon-button danger-action" disabled={busy === business._id} onClick={() => changeStatus(business._id, "suspended")} aria-label="Suspend"><X size={16} /></button>}
          </div></td>
        </tr>)}
        {!businesses.length && <tr><td colSpan="7" className="empty-table">{error || "No businesses match these filters."}</td></tr>}
      </tbody></table></div>}
    </Panel>

    {editing && editForm && <div className="user-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditing(null); setEditForm(null); } }}>
      <section className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-company-title">
        <h2 id="edit-company-title">Edit company</h2>
        <form className="user-create-form" onSubmit={saveCompany}>
          <div className="form-grid">
            <label>Company name<input required minLength="2" maxLength="120" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
            <label>Store address<input required minLength="2" maxLength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editForm.slug} onChange={(event) => setEditForm({ ...editForm, slug: slugFromName(event.target.value) })} /></label>
            <label>Owner name<input required minLength="2" maxLength="120" value={editForm.ownerName} onChange={(event) => setEditForm({ ...editForm, ownerName: event.target.value })} /></label>
            <label>Contact email<input required type="email" maxLength="254" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></label>
            <label>Phone<input maxLength="40" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
            <label>Category<input required minLength="2" maxLength="80" value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} /></label>
            <label>Subscription fee / rental amount<input type="number" min="0" max="1000000000000" step="0.01" value={editForm.subscriptionFee} onChange={(event) => setEditForm({ ...editForm, subscriptionFee: event.target.value })} /></label>
            <label>Billing currency<input minLength="3" maxLength="3" pattern="[A-Za-z]{3}" value={editForm.billingCurrency} onChange={(event) => setEditForm({ ...editForm, billingCurrency: event.target.value.toUpperCase() })} /></label>
            <label>Billing frequency<select value={editForm.billingFrequency} onChange={(event) => setEditForm({ ...editForm, billingFrequency: event.target.value })}><option value="">Not configured</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
            <label className="form-field-wide">Description<textarea maxLength="1000" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="user-form-footer"><button type="button" className="button subtle" onClick={() => { setEditing(null); setEditForm(null); }}>Cancel</button><button className="button primary" type="submit" disabled={busy === editing}>{busy === editing ? "Saving…" : "Save changes"}</button></div>
        </form>
      </section>
    </div>}
    <p className="footnote">Suspending a business blocks its users’ sign-in. Existing orders and records are retained. Status changes are written to the administrative audit log.</p>
  </div>;
}
