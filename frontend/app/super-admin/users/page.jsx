"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, KeyRound, Pencil, Power, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api, shortDate } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const emptyForm = { name: "", username: "", password: "", confirmPassword: "" };

export default function UserManagementPage() {
  const [role, setRole] = useState("business_owner");
  const [users, setUsers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [businessError, setBusinessError] = useState("");
  const [success, setSuccess] = useState("");
  const [companyCreated, setCompanyCreated] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirmPassword: "" });
  const [actionBusy, setActionBusy] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(`/admin/users?role=${role}&page=${page}&limit=50&search=${encodeURIComponent(search)}`);
      setUsers(result.items);
      setPages(result.pages);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [page, role, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    let active = true;
    async function loadBusinesses() {
      try {
        const firstPage = await api("/admin/businesses?limit=100&page=1");
        const allBusinesses = [...firstPage.items];
        for (let nextPage = 2; nextPage <= firstPage.pages; nextPage += 1) {
          const result = await api(`/admin/businesses?limit=100&page=${nextPage}`);
          allBusinesses.push(...result.items);
        }
        if (active) {
          setBusinesses(allBusinesses);
          setBusinessError("");
        }
      } catch (reason) {
        if (active) setBusinessError(reason.message);
      }
    }
    loadBusinesses();
    return () => { active = false; };
  }, []);

  function changeRole(nextRole) {
    setRole(nextRole);
    setPage(1);
    setForm(emptyForm);
    setSuccess("");
    setCompanyCreated(false);
    setError("");
    setResetUser(null);
  }

  async function createUser(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          role,
          ...(role === "business_owner" ? { tenantId: selectedTenantId } : {})
        })
      });
      setForm(emptyForm);
      setShowForm(false);
      setPage(1);
      setCompanyCreated(role === "business_owner");
      setSuccess(role === "super_admin" ? "Platform administrator created." : "Company account created.");
      if (page === 1) await loadUsers();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeUserStatus(user) {
    const active = !user.active;
    if (!window.confirm(`Confirm ${active ? "activating" : "disabling"} ${user.username || "this user"}?`)) return;
    setActionBusy(user._id);
    setError("");
    setSuccess("");
    try {
      await api(`/admin/users/${user._id}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
      setSuccess(`User ${active ? "activated" : "disabled"}.`);
      await loadUsers();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setActionBusy("");
    }
  }

  async function resetUserPassword(event) {
    event.preventDefault();
    if (!resetUser) return;
    if (resetForm.password !== resetForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setActionBusy(resetUser._id);
    setError("");
    setSuccess("");
    try {
      await api(`/admin/users/${resetUser._id}/password`, { method: "PATCH", body: JSON.stringify(resetForm) });
      setSuccess(`Password reset for ${resetUser.username}.`);
      setResetUser(null);
      setResetForm({ password: "", confirmPassword: "" });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setActionBusy("");
    }
  }

  function startEditingUser(user) {
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      username: user.username || "",
      role: user.role,
      tenantId: user.tenantId?._id || "",
      business: user.tenantId ? {
        name: user.tenantId.name || "",
        slug: user.tenantId.slug || "",
        email: user.tenantId.email || "",
        phone: user.tenantId.phone || "",
        category: user.tenantId.category || "Retail",
        description: user.tenantId.description || "",
        subscriptionFee: user.tenantId.subscriptionFee == null ? "" : String(user.tenantId.subscriptionFee),
        billingCurrency: user.tenantId.billingCurrency || "",
        billingFrequency: user.tenantId.billingFrequency || ""
      } : null
    });
    setError("");
    setSuccess("");
  }

  async function saveUserChanges(event) {
    event.preventDefault();
    if (!editingUser || !editForm) return;
    setActionBusy(editingUser._id);
    setError("");
    setSuccess("");
    const body = {
      name: editForm.name,
      username: editForm.username,
      role: editForm.role,
      tenantId: editForm.role === "business_owner" ? (editingUser.tenantId?._id || editForm.tenantId) : null,
      ...(editForm.business && editForm.role === "business_owner" ? {
        business: {
          ...editForm.business,
          ownerName: editForm.name,
          ...(editForm.business.subscriptionFee !== "" ? { subscriptionFee: Number(editForm.business.subscriptionFee) } : {}),
          ...(editForm.business.billingCurrency ? { billingCurrency: editForm.business.billingCurrency } : {}),
          ...(editForm.business.billingFrequency ? { billingFrequency: editForm.business.billingFrequency } : {})
        }
      } : {})
    };
    try {
      await api(`/admin/users/${editingUser._id}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditingUser(null);
      setEditForm(null);
      setSuccess("Account and business details updated.");
      if (editForm.role !== role) {
        setRole(editForm.role);
        setPage(1);
      } else {
        await loadUsers();
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setActionBusy("");
    }
  }

  async function changeBusinessStatus(user) {
    const business = user.tenantId;
    if (!business) return;
    const status = business.status === "active" ? "suspended" : "active";
    if (!window.confirm(`Confirm ${status === "active" ? "activating" : "suspending"} ${business.name}?`)) return;
    setActionBusy(user._id);
    setError("");
    setSuccess("");
    try {
      await api(`/admin/businesses/${business._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setSuccess(`Business ${status === "active" ? "activated" : "suspended"}.`);
      await loadUsers();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setActionBusy("");
    }
  }

  const accountLabel = role === "super_admin" ? "platform administrators" : "company accounts";

  return <div className="page-content">
    <PageHeader
      eyebrow="USERS & ACCESS"
      title="User management"
      description="Manage business accounts and their owners, billing terms, access, and secure password resets."
      actions={<span className="live-chip"><i /> {accountLabel}</span>}
    />

    <div className="user-role-tabs" role="tablist" aria-label="User account type">
      <button type="button" role="tab" aria-selected={role === "business_owner"} className={role === "business_owner" ? "selected" : ""} onClick={() => changeRole("business_owner")}><Users size={15} /> Company users</button>
      <button type="button" role="tab" aria-selected={role === "super_admin"} className={role === "super_admin" ? "selected" : ""} onClick={() => changeRole("super_admin")}><ShieldCheck size={15} /> Platform admins</button>
    </div>

    <div className="user-management-grid">
      <Panel
        title={role === "super_admin" ? "Platform administrators" : "Company dashboard users"}
        action={<button className="button primary compact" onClick={() => { setShowForm(!showForm); setError(""); setSuccess(""); }}><UserPlus size={14} /> {showForm ? "Close form" : "Add user"}</button>}
      >
        {role === "business_owner" && <div className="user-scope-picker"><label htmlFor="user-company">Company</label><select id="user-company" value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)} disabled={!!businessError}><option value="">Select a company to manage</option>{businesses.map((business) => <option key={business._id} value={business._id}>{business.name} · {business.status}</option>)}</select>{businessError && <small className="user-form-error">{businessError}</small>}</div>}
        {showForm && <form className="user-create-form" onSubmit={createUser}>
          <div className="form-grid">
            <label>Full name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
            <label>Username<input required minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" autoCapitalize="none" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" placeholder="company.user" /><small>Letters, numbers, dots, underscores, and hyphens.</small></label>
            <label>Password<input required type="password" minLength="12" maxLength="128" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label>
            <label>Confirm password<input required type="password" minLength="12" maxLength="128" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" /></label>
          </div>
          <div className="user-form-footer"><span>{role === "super_admin" ? "This account can manage the entire platform." : "The account is assigned to the selected company."}</span><button className="button primary" type="submit" disabled={saving || (role === "business_owner" && (!!businessError || !selectedTenantId))}>{saving ? "Creating…" : "Create account"}</button></div>
        </form>}

        {success && <p className="user-success" role="status">{success}{companyCreated && <> <a href="/super-admin/payments">Open Payment Management</a></>}</p>}
        {error && <p className="inline-error user-message" role="alert">{error}</p>}

        {resetUser && <form className="user-create-form user-reset-form" onSubmit={resetUserPassword}>
          <div className="user-form-section"><KeyRound size={15} /><b>Reset password for {resetUser.username}</b></div>
          <div className="form-grid">
            <label>New password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={resetForm.password} onChange={(event) => setResetForm({ ...resetForm, password: event.target.value })} /></label>
            <label>Confirm new password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={resetForm.confirmPassword} onChange={(event) => setResetForm({ ...resetForm, confirmPassword: event.target.value })} /></label>
          </div>
          <div className="user-form-footer"><button type="button" className="button subtle" onClick={() => setResetUser(null)}>Cancel</button><button className="button primary" type="submit" disabled={actionBusy === resetUser._id}>{actionBusy === resetUser._id ? "Resetting…" : "Reset password"}</button></div>
        </form>}

        <div className="user-list-toolbar">
          <label className="table-search"><Search size={15} /><input placeholder="Search business, owner, or username" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <span>{loading ? "Loading…" : `${users.length} shown`}</span>
        </div>
        {loading && !users.length ? <LoadingState /> : error && !users.length ? <LoadingState error={error} retry={loadUsers} /> : <div className="table-wrap">
          <table><thead><tr>{role === "business_owner" && <><th>BUSINESS</th><th>OWNER</th><th>LOGIN</th><th>SUBSCRIPTION</th><th>PAYMENT</th><th>BUSINESS STATUS</th></>}<th>ROLE</th>{role === "super_admin" && <><th>ADMIN</th><th>STATUS</th></>}<th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>
            {users.map((user) => <tr key={user._id}>
              {role === "business_owner" && <>
                <td>{user.tenantId?.name || "Business unavailable"}<small className="table-subline">{user.tenantId?.slug || ""}</small></td>
                <td>{user.name}<small className="table-subline">{user.tenantId?.email || ""}</small></td>
                <td>{user.username || user.email.split("@")[0]}<small className="table-subline">Business owner</small></td>
                <td>{user.tenantId?.subscriptionFee == null || !user.tenantId?.billingCurrency || !user.tenantId?.billingFrequency ? "Not configured" : new Intl.NumberFormat("en-US", { style: "currency", currency: user.tenantId.billingCurrency }).format(user.tenantId.subscriptionFee)}{user.tenantId?.billingFrequency && <small className="table-subline">{user.tenantId.billingFrequency}</small>}</td>
                <td><span className="quiet-label">Not tracked</span></td>
                <td><StatusPill tone={user.tenantId?.status || "suspended"}>{user.tenantId?.status || "Unavailable"}</StatusPill><small className="table-subline">{user.active ? "User active" : "User disabled"}</small></td>
              </>}
              <td>{role === "super_admin" ? "Platform admin" : "Business owner"}</td>
              {role === "super_admin" && <><td>{user.name}<small className="table-subline">{user.username}</small></td><td><StatusPill tone={user.active ? "active" : "suspended"}>{user.active ? "Active" : "Disabled"}</StatusPill></td></>}
              <td>{shortDate(user.createdAt)}</td>
              <td><div className="row-actions">
                <button className="icon-button" disabled={actionBusy === user._id} onClick={() => startEditingUser(user)} aria-label={`Edit ${user.name}`} title="View and edit account"><Pencil size={14} /></button>
                <button className="icon-button" disabled={actionBusy === user._id} onClick={() => { setResetUser(user); setResetForm({ password: "", confirmPassword: "" }); setError(""); }} aria-label={`Reset password for ${user.username}`} title="Reset password"><KeyRound size={14} /></button>
                {role === "business_owner" && <button className={`icon-button ${user.tenantId?.status === "active" ? "danger-action" : "success-action"}`} disabled={actionBusy === user._id || !user.tenantId} onClick={() => changeBusinessStatus(user)} aria-label={`${user.tenantId?.status === "active" ? "Suspend" : "Activate"} business`} title={user.tenantId?.status === "active" ? "Suspend business" : "Activate business"}><Building2 size={14} /></button>}
                <button className={`icon-button ${user.active ? "danger-action" : "success-action"}`} disabled={actionBusy === user._id} onClick={() => changeUserStatus(user)} aria-label={`${user.active ? "Disable" : "Activate"} ${user.username}`} title={user.active ? "Disable account" : "Activate account"}><Power size={14} /></button>
              </div></td>
            </tr>)}
            {!users.length && <tr><td colSpan={role === "business_owner" ? 9 : 5} className="empty-table">{search ? "No users match your search." : `No ${accountLabel} have been created yet.`}</td></tr>}
          </tbody></table>
        </div>}
        <div className="user-pagination"><button className="button subtle compact" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(pages, 1)}</span><button className="button subtle compact" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Next</button></div>
      </Panel>

      <aside className="user-security-note"><KeyRound size={17} /><div><b>Account access</b><p>Only platform administrators can create accounts. Users sign in with their username and password. Company users are restricted to the company assigned here. Passwords are stored as secure hashes and are never shown in this list.</p></div></aside>
    </div>
    {editingUser && editForm && <div className="user-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingUser(null); setEditForm(null); } }}>
      <section className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
        <h2 id="edit-user-title">Account details · {editForm.business?.name || "Platform admin"}</h2>
        <form className="user-create-form" onSubmit={saveUserChanges}>
          <div className="form-grid">
            <label>Full name<input required minLength="2" maxLength="120" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
            <label>Login username<input required minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" value={editForm.username} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} /></label>
            <label>Assigned role<select required value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}><option value="business_owner">Business owner</option><option value="super_admin">Platform admin</option></select></label>
            {editForm.role === "business_owner" && editingUser.role === "super_admin" && <label>Business<select required value={editForm.tenantId} onChange={(event) => setEditForm({ ...editForm, tenantId: event.target.value })}><option value="">Select a business</option>{businesses.map((business) => <option key={business._id} value={business._id}>{business.name} · {business.status}</option>)}</select></label>}
            {editForm.business && editForm.role === "business_owner" && <>
              <label>Business name<input required minLength="2" maxLength="120" value={editForm.business.name} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, name: event.target.value } })} /></label>
              <label>Store address<input required minLength="2" maxLength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editForm.business.slug} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, slug: event.target.value.toLowerCase() } })} /></label>
              <label>Business contact email<input required type="email" maxLength="254" value={editForm.business.email} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, email: event.target.value } })} /></label>
              <label>Phone<input maxLength="40" value={editForm.business.phone} onChange={(event) => setEditForm({ ...editForm.business, phone: event.target.value })} /></label>
              <label>Category<input required minLength="2" maxLength="80" value={editForm.business.category} onChange={(event) => setEditForm({ ...editForm.business, category: event.target.value })} /></label>
              <label>Subscription fee / rental amount<input type="number" min="0" max="1000000000000" step="0.01" value={editForm.business.subscriptionFee} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, subscriptionFee: event.target.value } })} /></label>
              <label>Billing currency<input minLength="3" maxLength="3" pattern="[A-Za-z]{3}" value={editForm.business.billingCurrency} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, billingCurrency: event.target.value.toUpperCase() } })} /></label>
              <label>Billing frequency<select value={editForm.business.billingFrequency} onChange={(event) => setEditForm({ ...editForm, business: { ...editForm.business, billingFrequency: event.target.value } })}><option value="">Not configured</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
              <label className="form-field-wide">Description<textarea maxLength="1000" value={editForm.business.description} onChange={(event) => setEditForm({ ...editForm.business, description: event.target.value })} /></label>
            </>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="user-form-footer"><button type="button" className="button subtle" onClick={() => { setEditingUser(null); setEditForm(null); }}>Cancel</button><button className="button primary" type="submit" disabled={actionBusy === editingUser._id}>{actionBusy === editingUser._id ? "Saving…" : "Save changes"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
