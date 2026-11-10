"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Clock3, CreditCard, Landmark, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X, Zap } from "lucide-react";
import { LoadingState, MetricCard, PageHeader, Panel, StatusPill } from "../../../components/AppShell";
import { api, money, shortDate } from "../../../lib/api";

const paymentStatuses = ["all", "pending", "paid", "failed", "refunded"];
const companyPaymentProviders = [
  { id: "zaad", name: "ZAAD Money", organization: "Telesom", mark: "ZAAD", logo: "zaad" },
  { id: "evc_plus", name: "Hormuud Money", organization: "EVC Plus", mark: "H", logo: "hormuud" },
  { id: "edahab", name: "Somtel Money", organization: "eDahab", mark: "S", logo: "somtel" },
  { id: "sahal", name: "Golis Money", organization: "SAHAL", mark: "G", logo: "golis" },
  { id: "sifalo_pay", name: "Sifalo Pay", organization: "Payment gateway", mark: "S", logo: "sifalo" },
  { id: "card", name: "Card Payment", organization: "Visa / Mastercard", logo: "card" },
  { id: "bank_transfer", name: "Bank payments", organization: "Bank transfer", logo: "bank" }
];
const emptyProviderForm = { provider: "zaad", apiKey: "", merchantToken: "", webhookSecret: "", commissionRate: "2.5", enabled: false };

function ProviderLogo({ provider }) {
  const config = companyPaymentProviders.find((item) => item.id === provider);
  if (!config) return null;
  if (config.logo === "card") {
    return <span className="company-provider-logo provider-logo-card" aria-label="Visa and Mastercard"><CreditCard size={16} /><i /><em /></span>;
  }
  if (config.logo === "bank") {
    return <span className="company-provider-logo provider-logo-bank" aria-label="Bank"><Landmark size={17} /></span>;
  }
  if (config.logo === "somtel") {
    return <span className="company-provider-logo provider-logo-somtel" aria-label="Somtel"><Zap size={18} fill="currentColor" /></span>;
  }
  return <span className={`company-provider-logo provider-logo-${config.logo}`} aria-label={config.organization}>{config.mark}</span>;
}

function newProviderForm(configuredProviders = []) {
  const provider = companyPaymentProviders.find((item) =>
    !configuredProviders.some((configured) => configured.provider === item.id)
  );
  return { ...emptyProviderForm, provider: provider?.id || "" };
}

export default function PlatformPaymentsPage() {
  const [data, setData] = useState(null);
  const [setup, setSetup] = useState(null);
  const [setupPage, setSetupPage] = useState(1);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState("");
  const [paymentCompany, setPaymentCompany] = useState(null);
  const [companyProviders, setCompanyProviders] = useState([]);
  const [providerForm, setProviderForm] = useState(emptyProviderForm);
  const [editingProvider, setEditingProvider] = useState("");
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerSuccess, setProviderSuccess] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ status, search, page: String(page), limit: "50" });
    setLoading(true);
    try {
      setError("");
      setData(await api(`/admin/payments?${query}`));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  const loadSetup = useCallback(async () => {
    setSetupLoading(true);
    try {
      setSetupError("");
      setSetup(await api(`/admin/payment-management?page=${setupPage}&limit=50`));
    } catch (reason) {
      setSetupError(reason.message);
    } finally {
      setSetupLoading(false);
    }
  }, [setupPage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSetup(); }, [loadSetup]);

  async function openCompanyPayments(company) {
    setPaymentCompany(company);
    setCompanyProviders([]);
    setProviderForm(newProviderForm());
    setEditingProvider("");
    setProviderError("");
    setProviderSuccess("");
    setProviderLoading(true);
    try {
      const result = await api(`/admin/payment-management/companies/${company._id}/providers`);
      setCompanyProviders(result.items);
      setProviderForm(newProviderForm(result.items));
    } catch (reason) {
      setProviderError(reason.message);
    } finally {
      setProviderLoading(false);
    }
  }

  function closeCompanyPayments() {
    setPaymentCompany(null);
    setProviderError("");
    setProviderSuccess("");
    setProviderForm(newProviderForm(companyProviders));
    setEditingProvider("");
  }

  function editCompanyProvider(provider) {
    setEditingProvider(provider.provider);
    setProviderForm({
      provider: provider.provider,
      apiKey: "",
      merchantToken: "",
      webhookSecret: "",
      commissionRate: String(provider.commissionRate),
      enabled: provider.enabled
    });
    setProviderError("");
    setProviderSuccess("");
  }

  async function saveCompanyProvider(event) {
    event.preventDefault();
    if (!paymentCompany) return;
    setProviderSaving(true);
    setProviderError("");
    setProviderSuccess("");
    try {
      const result = await api(
        `/admin/payment-management/companies/${paymentCompany._id}/providers/${providerForm.provider}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            apiKey: providerForm.apiKey || undefined,
            merchantToken: providerForm.merchantToken || undefined,
            webhookSecret: providerForm.webhookSecret || undefined,
            commissionRate: Number(providerForm.commissionRate),
            enabled: providerForm.enabled
          })
        }
      );
      setCompanyProviders((current) => {
        const existingIndex = current.findIndex((item) => item.provider === result.item.provider);
        if (existingIndex < 0) return [...current, result.item];
        return current.map((item) => item.provider === result.item.provider ? result.item : item);
      });
      setProviderSuccess(`${companyPaymentProviders.find((item) => item.id === result.item.provider)?.name} payment settings saved.`);
      setProviderForm(newProviderForm([
        ...companyProviders.filter((item) => item.provider !== result.item.provider),
        result.item
      ]));
      setEditingProvider("");
    } catch (reason) {
      setProviderError(reason.message);
    } finally {
      setProviderSaving(false);
    }
  }

  async function removeCompanyProvider(provider) {
    if (!paymentCompany || !window.confirm(`Remove ${companyPaymentProviders.find((item) => item.id === provider)?.name} from ${paymentCompany.name}?`)) return;
    setProviderError("");
    setProviderSuccess("");
    try {
      await api(`/admin/payment-management/companies/${paymentCompany._id}/providers/${provider}`, { method: "DELETE" });
      const updatedProviders = companyProviders.filter((item) => item.provider !== provider);
      setCompanyProviders(updatedProviders);
      if (editingProvider === provider) {
        setEditingProvider("");
        setProviderForm(newProviderForm(updatedProviders));
      }
      setProviderSuccess("Payment provider removed.");
    } catch (reason) {
      setProviderError(reason.message);
    }
  }

  const metrics = data?.metrics;

  return <div className="page-content">
    <PageHeader eyebrow="COMMERCE MONITORING" title="Payment management" description="Review recorded order payment statuses across tenants and check provider readiness." actions={<a className="button subtle" href="/super-admin/audit">Review audit log</a>} />

    <div className="payment-safety-banner"><ShieldCheck size={18} /><div><b>Online payment processing is not configured</b><p>Provider API keys can be stored securely below, but checkout cannot charge customers until a verified payment adapter and webhook are installed.</p></div></div>

    <div className="metric-grid payment-metrics">
      <MetricCard label="ORDER PAYMENTS" value={(metrics?.total || 0).toLocaleString()} note="Orders with a recorded payment status" icon={CircleDollarSign} />
      <MetricCard label="PENDING" value={(metrics?.pending || 0).toLocaleString()} note="Awaiting an authorized payment flow" icon={Clock3} tone="amber" />
      <MetricCard label="RECORDED AS PAID" value={(metrics?.paid || 0).toLocaleString()} note={money(metrics?.paidVolume || 0)} icon={CircleDollarSign} tone="green" />
      <MetricCard label="FAILED / REFUNDED" value={((metrics?.failed || 0) + (metrics?.refunded || 0)).toLocaleString()} note={`${metrics?.failed || 0} failed · ${metrics?.refunded || 0} refunded`} icon={RefreshCw} tone="muted" />
    </div>

    <Panel title="Payment activity by order" action={<div className="filter-actions"><label className="table-search"><Search size={14} /><input aria-label="Search order or company" placeholder="Search order or company" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filter payment status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{paymentStatuses.map((item) => <option value={item} key={item}>{item === "all" ? "All payment statuses" : item}</option>)}</select></div>}>
      {loading && !data ? <LoadingState /> : error && !data ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>COMPANY</th><th>ITEM</th><th>AMOUNT</th><th>RECORDED STATUS</th><th>UPDATED</th></tr></thead><tbody>
        {(data?.items || []).map((order) => <tr key={order._id}>
          <td><b>{order.orderNumber}</b><small className="table-subline">{shortDate(order.createdAt)}</small></td>
          <td>{order.tenantId?.name || "Business unavailable"}<small className="table-subline">{order.tenantId?.slug || ""}</small></td>
          <td>{order.item.name}<small className="table-subline">{order.item.variant || "Standard"} × {order.item.quantity}</small></td>
          <td><b>{money(order.total)}</b></td><td><StatusPill tone={order.paymentStatus}>{order.paymentStatus}</StatusPill></td><td>{shortDate(order.updatedAt)}</td>
        </tr>)}
        {!error && !data?.items.length && <tr><td colSpan="6" className="empty-table">No order payment activity matches these filters.</td></tr>}
      </tbody></table></div>}
      {error && data && <p className="inline-error payment-inline-error" role="alert">{error}</p>}
      <div className="user-pagination"><button className="button subtle compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(data?.pages || 1, 1)} · {data?.total || 0} orders</span><button className="button subtle compact" disabled={page >= (data?.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
    </Panel>

    <Panel title="Company and user details" action={<span className="payment-record-count">{setup?.total || 0} companies</span>}>
      <p className="payment-section-note">Company profiles and their assigned dashboard accounts appear here after they are created in Super Admin user management. Passwords are never displayed.</p>
      {setupLoading && !setup ? <LoadingState /> : setupError && !setup ? <LoadingState error={setupError} retry={loadSetup} /> : <>
        <div className="table-wrap"><table><thead><tr><th>COMPANY</th><th>COMPANY OWNER</th><th>PAYMENT</th><th>ACCOUNT</th><th>CONTACT</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>
          {(setup?.companies || []).map((company) => <tr key={company._id}>
            <td><b>{company.name}</b><small className="table-subline">{company.slug} · {company.category}</small>{company.description && <small className="table-subline">{company.description}</small>}</td>
            <td>{company.ownerName}<small className="table-subline">{company.email}</small></td>
            <td><button className="button subtle compact payment-add-button" onClick={() => openCompanyPayments(company)}><Plus size={13} /> Add Payment</button></td>
            <td>{company.accounts.length ? <div className="payment-account-list">{company.accounts.map((account) => <div className="payment-account-row" key={account._id}><b>{account.username}</b><small>{account.active ? "Active" : "Disabled"} · created {shortDate(account.createdAt)}</small></div>)}</div> : "No account assigned"}</td>
            <td>{company.phone || "—"}</td>
            <td><StatusPill tone={company.status}>{company.status}</StatusPill><small className="table-subline">Plan: {company.plan}</small></td>
            <td>{shortDate(company.createdAt)}</td>
          </tr>)}
          {!setup?.companies.length && <tr><td colSpan="7" className="empty-table">No companies have been created yet.</td></tr>}
        </tbody></table></div>
        {setupError && <p className="inline-error payment-inline-error" role="alert">{setupError}</p>}
        <div className="user-pagination"><button className="button subtle compact" disabled={setupPage <= 1 || setupLoading} onClick={() => setSetupPage(setupPage - 1)}>Previous</button><span>Page {setupPage} of {Math.max(setup?.pages || 1, 1)}</span><button className="button subtle compact" disabled={setupPage >= (setup?.pages || 1) || setupLoading} onClick={() => setSetupPage(setupPage + 1)}>Next</button></div>
      </>}
    </Panel>

    {paymentCompany && <div className="payment-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !providerSaving) closeCompanyPayments(); }}>
      <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="company-payment-title">
        <header className="payment-dialog-header"><div><h2 id="company-payment-title">Payment providers</h2><p>Configure company-specific payment methods for {paymentCompany.name}.</p></div><button className="icon-button" aria-label="Close payment settings" onClick={closeCompanyPayments} disabled={providerSaving}><X size={16} /></button></header>
        <div className="payment-dialog-content">
          {providerSuccess && <p className="payment-setup-success" role="status">{providerSuccess}</p>}
          {providerError && <p className="inline-error payment-dialog-error" role="alert">{providerError}</p>}
          <div className="payment-company-provider-table table-wrap"><table><thead><tr><th>PROVIDER</th><th>STATUS</th><th>API KEY</th><th>MERCHANT TOKEN</th><th>WEBHOOK SECRET</th><th>COMMISSION</th><th>ACTIONS</th></tr></thead><tbody>
            {companyProviders.map((provider) => <tr key={provider.provider}>
              <td><div className="company-provider-name"><ProviderLogo provider={provider.provider} /><div><b>{companyPaymentProviders.find((item) => item.id === provider.provider)?.name || provider.provider}</b><small>{companyPaymentProviders.find((item) => item.id === provider.provider)?.organization}</small></div></div></td>
              <td><StatusPill tone={provider.connectionStatus === "requires_attention" ? "pending" : "neutral"}>{provider.connectionStatus === "requires_attention" ? "Requires Attention" : "Not Configured"}</StatusPill><small className="table-subline">{provider.enabled ? "Enabled" : "Disabled"}</small></td>
              <td>{provider.apiKeyConfigured ? `Configured ·••••••••••••${provider.apiKeyHint}` : "Not Configured"}</td>
              <td>{provider.merchantTokenConfigured ? `Configured ·••••••••••••${provider.merchantTokenHint}` : "Not Configured"}</td>
              <td>{provider.webhookConfigured ? `Configured ·••••••••••••${provider.webhookHint}` : "Not Configured"}</td>
              <td>{provider.commissionRate}%</td>
              <td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${provider.provider}`} title="Edit provider" onClick={() => editCompanyProvider(provider)}><Pencil size={14} /></button><button className="icon-button danger-action" aria-label={`Remove ${provider.provider}`} title="Remove provider" onClick={() => removeCompanyProvider(provider.provider)}><Trash2 size={14} /></button></div></td>
            </tr>)}
            {!providerLoading && !companyProviders.length && <tr><td colSpan="7" className="empty-table">No payment providers configured for this company.</td></tr>}
          </tbody></table></div>
          {providerLoading && <LoadingState />}
          <form className="payment-provider-form" onSubmit={saveCompanyProvider}>
            <h3>{editingProvider ? "Edit payment provider" : "Add payment provider"}</h3>
            <fieldset className="company-provider-choices" disabled={!!editingProvider}>
              <legend>Provider</legend>
              {companyPaymentProviders.map((provider) => {
                const configured = companyProviders.some((item) => item.provider === provider.id && item.provider !== editingProvider);
                return <button className={`company-provider-choice ${providerForm.provider === provider.id ? "selected" : ""}`} type="button" key={provider.id} disabled={configured} aria-pressed={providerForm.provider === provider.id} onClick={() => setProviderForm({ ...providerForm, provider: provider.id })}>
                  <ProviderLogo provider={provider.id} />
                  <span><b>{provider.name}</b><small>{provider.organization}</small></span>
                </button>;
              })}
            </fieldset>
            <label>API key<input required={!editingProvider} type="password" autoComplete="new-password" maxLength="4096" value={providerForm.apiKey} onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })} placeholder={editingProvider ? "Leave blank to keep the saved key" : "Enter provider API key"} /></label>
            <label>Merchant token (optional)<input type="password" autoComplete="new-password" maxLength="4096" value={providerForm.merchantToken} onChange={(event) => setProviderForm({ ...providerForm, merchantToken: event.target.value })} placeholder={editingProvider ? "Leave blank to keep the saved token" : "Enter merchant token"} /></label>
            <label>Webhook secret (optional)<input type="password" autoComplete="new-password" maxLength="4096" value={providerForm.webhookSecret} onChange={(event) => setProviderForm({ ...providerForm, webhookSecret: event.target.value })} placeholder={editingProvider ? "Leave blank to keep the saved secret" : "Enter webhook secret"} /></label>
            <label>Commission rate (%)<input required type="number" min="0" max="100" step="0.01" value={providerForm.commissionRate} onChange={(event) => setProviderForm({ ...providerForm, commissionRate: event.target.value })} /></label>
            <label className="payment-enable-toggle"><input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })} /><span>Enable provider</span></label>
            <p className="payment-form-note">Saving credentials does not activate checkout. A verified provider integration must be installed before payments can be processed.</p>
            <div className="payment-provider-form-actions"><button type="button" className="button subtle" disabled={providerSaving} onClick={() => { setProviderForm(newProviderForm(companyProviders)); setEditingProvider(""); setProviderError(""); }}>Cancel</button><button className="button primary" type="submit" disabled={providerSaving || providerLoading || !providerForm.provider}>{providerSaving ? "Saving…" : editingProvider ? "Save changes" : "Save Provider"}</button></div>
          </form>
        </div>
      </section>
    </div>}

  </div>;
}
