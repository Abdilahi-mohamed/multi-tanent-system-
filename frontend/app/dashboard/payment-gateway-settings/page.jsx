"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, CreditCard, Save, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { LoadingState, PageHeader, Panel } from "../../../components/AppShell";
import { PaymentProviderCatalog } from "../../../components/PaymentProviderCatalog";
import { api } from "../../../lib/api";
import { paymentProviders } from "../../../lib/payment-providers";

const icons = {
  "Mobile money": Wallet,
  Gateway: Building2,
  Cards: CreditCard,
  "Bank payments": Building2
};

const blankForm = () => ({ apiKey: "", merchantToken: "", webhookSecret: "", commissionRate: "2.5", enabled: false });

export default function PaymentGatewaySettingsPage() {
  const [configured, setConfigured] = useState([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api("/tenant/payment-gateways");
      setConfigured(result.items);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openProvider(provider) {
    const saved = configured.find((item) => item.provider === provider.id);
    setSelected(provider.id);
    setForm(saved
      ? { ...blankForm(), commissionRate: String(saved.commissionRate), enabled: saved.enabled }
      : blankForm());
    setError("");
    setMessage("");
  }

  async function saveProvider(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await api(`/tenant/payment-gateways/${selected}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          commissionRate: Number(form.commissionRate),
          apiKey: form.apiKey || undefined,
          merchantToken: form.merchantToken || undefined,
          webhookSecret: form.webhookSecret || undefined
        })
      });
      setConfigured((items) => [...items.filter((item) => item.provider !== selected), saved.item]);
      setForm(blankForm());
      setSelected("");
      setMessage("Gateway settings saved. Connection remains unverified until a supported payment adapter is installed.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeProvider(provider) {
    setError("");
    setMessage("");
    try {
      await api(`/tenant/payment-gateways/${provider}`, { method: "DELETE" });
      setConfigured((items) => items.filter((item) => item.provider !== provider));
      setMessage("Saved gateway credentials removed.");
    } catch (reason) {
      setError(reason.message);
    }
  }

  const selectedProvider = paymentProviders.find((provider) => provider.id === selected);

  return <div className="page-content">
    <PageHeader eyebrow="PAYMENTS & SALES" title="Payment Gateway Settings" description="Manage this company's merchant credentials and payment methods. Credentials are encrypted by the API and are never returned to the browser." />
    <div className="payment-safety-banner"><ShieldCheck size={18} /><div><b>Credentials are protected</b><p>Secret values are encrypted before storage and are not shown after saving. Adding credentials does not activate customer checkout; an approved provider adapter is still required.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {message && <p className="customer-auth-message" role="status">{message}</p>}
    {loading && !configured.length ? <LoadingState /> : <div className="payment-gateway-grid">
      {paymentProviders.map((provider) => {
        const Icon = icons[provider.category] || Building2;
        const saved = configured.find((item) => item.provider === provider.id);
        const isEditing = selected === provider.id;
        const connectionStatus = saved?.connectionStatus || "not_configured";
        const connectionLabel = connectionStatus === "connected" ? "Configured" : connectionStatus === "requires_attention" ? "Requires Attention" : "Not Configured";
        return <Panel className="payment-gateway-panel" key={provider.id} title={provider.name} action={<span className={`gateway-status ${connectionStatus}`}><i />{connectionLabel}</span>}>
          <div className="payment-gateway-provider"><span className="payment-provider-icon"><Icon size={18} /></span><div><b>{provider.organization}</b><small>{provider.category}</small></div></div>
          <p className="payment-gateway-description">{provider.description}</p>
          {saved && <div className="payment-credential-summary">
            <span>{saved.apiKeyConfigured ? `API key · Configured ·••••••••••••${saved.apiKeyHint}` : "API key · Not Configured"}</span>
            <span>{saved.merchantTokenConfigured ? `Merchant token · Configured ·••••••••••••${saved.merchantTokenHint}` : "Merchant token · Not Configured"}</span>
            <span>{saved.webhookConfigured ? `Webhook secret · Configured ·••••••••••••${saved.webhookHint}` : "Webhook secret · Not Configured"}</span>
            <span>Commission · {saved.commissionRate}%</span>
          </div>}
          {isEditing ? <form className="payment-gateway-form" onSubmit={saveProvider}>
            <label>Merchant API key<input type="password" autoComplete="new-password" maxLength="4096" required={!saved} value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={saved ? "Leave blank to keep saved key" : "Enter merchant API key"} /></label>
            <label>Merchant token<input type="password" autoComplete="new-password" maxLength="4096" value={form.merchantToken} onChange={(event) => setForm({ ...form, merchantToken: event.target.value })} placeholder={saved ? "Leave blank to keep saved token" : "Optional merchant token"} /></label>
            <label>Webhook secret<input type="password" autoComplete="new-password" maxLength="4096" value={form.webhookSecret} onChange={(event) => setForm({ ...form, webhookSecret: event.target.value })} placeholder={saved ? "Leave blank to keep saved secret" : "Optional webhook secret"} /></label>
            <label>Commission rate (%)<input type="number" min="0" max="100" step="0.01" required value={form.commissionRate} onChange={(event) => setForm({ ...form, commissionRate: event.target.value })} /></label>
            <label className="payment-enable-toggle"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span>Enable this provider when integration is ready</span></label>
            <div className="payment-gateway-actions"><button type="button" className="button subtle compact" onClick={() => setSelected("")} disabled={saving}>Cancel</button><button type="submit" className="button primary compact" disabled={saving}><Save size={13} /> {saving ? "Saving…" : "Save settings"}</button></div>
          </form> : <div className="payment-gateway-actions">
            <button type="button" className="button subtle compact" onClick={() => openProvider(provider)}>{saved ? "Edit settings" : "Configure"}</button>
            {saved && <button type="button" className="icon-button danger-action" aria-label={`Remove ${provider.name} credentials`} title="Remove credentials" onClick={() => removeProvider(provider.id)}><Trash2 size={14} /></button>}
          </div>}
          {saved?.connectionStatus === "requires_attention" && <p className="gateway-attention"><AlertCircle size={13} /> Credentials saved, but no verified payment adapter is connected.</p>}
          {saved?.connectionStatus === "connected" && <p className="gateway-connected"><CheckCircle2 size={13} /> Payment adapter connected.</p>}
        </Panel>;
      })}
    </div>}
    <Panel title="Integration status" className="payment-readiness-panel">
      <p className="payment-section-note">The available gateway adapters have not been verified or installed for this platform. Credentials remain securely stored, but are not used to charge customers and must not be treated as a successful connection.</p>
      <PaymentProviderCatalog />
    </Panel>
  </div>;
}
