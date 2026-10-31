"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Plus, Search, X } from "lucide-react";
import { api, money } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const blankVariant = () => ({ sku: "", size: "", color: "", stock: "0" });

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", description: "", category: "", price: "", imageUrl: "", variants: [blankVariant()] });
  const load = useCallback(() => api("/tenant/products").then((result) => { setProducts(result.items); setError(""); }).catch((reason) => setError(reason.message)), []);
  useEffect(() => { load(); }, [load]);
  const visible = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(search.toLowerCase()));

  function setVariant(index, key, value) {
    setForm((current) => ({ ...current, variants: current.variants.map((variant, row) => row === index ? { ...variant, [key]: value } : variant) }));
  }
  async function createProduct(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await api("/tenant/products", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          variants: form.variants.map((variant) => ({ ...variant, stock: Number(variant.stock) }))
        })
      });
      setForm({ name: "", description: "", category: "", price: "", imageUrl: "", variants: [blankVariant()] });
      setShowForm(false);
      setNotice("Product created.");
      await load();
    } catch (reason) { setFormError(reason.message); }
    finally { setSaving(false); }
  }
  async function archive(product) {
    if (!window.confirm(`Archive ${product.name}? It will no longer appear in your storefront.`)) return;
    try {
      await api(`/tenant/products/${product._id}/archive`, { method: "PATCH", body: "{}" });
      await load();
    } catch (reason) { setError(reason.message); }
  }

  return <div className="page-content">
    <PageHeader eyebrow="CATALOG & STOCK" title="Products & variants" description="Manage your catalog and variant-level inventory for this store." actions={<button className="button primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Add product</button>} />
    {notice && <div className="inline-success">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    {showForm && <Panel title="Create product" className="form-panel"><form onSubmit={createProduct} className="product-form">
      <div className="form-grid"><label>Product name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Category<input maxLength="80" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Apparel" /></label><label>Price (USD)<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><label>Image URL<input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…" /></label><label className="wide-field">Description<textarea rows="2" maxLength="3000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></div>
      <div className="variant-builder"><div className="variant-builder-heading"><b>Stock variants</b><button type="button" className="text-link" onClick={() => setForm({ ...form, variants: [...form.variants, blankVariant()] })}><Plus size={14} /> Add variant</button></div>
        {form.variants.map((variant, index) => <div className="variant-input-row" key={index}><input aria-label="SKU" placeholder="SKU" value={variant.sku} onChange={(event) => setVariant(index, "sku", event.target.value)} /><input aria-label="Size" placeholder="Size" value={variant.size} onChange={(event) => setVariant(index, "size", event.target.value)} /><input aria-label="Color" placeholder="Color" value={variant.color} onChange={(event) => setVariant(index, "color", event.target.value)} /><input aria-label="Quantity" placeholder="Qty" type="number" min="0" required value={variant.stock} onChange={(event) => setVariant(index, "stock", event.target.value)} /><button type="button" className="icon-button danger-action" aria-label="Remove variant" disabled={form.variants.length === 1} onClick={() => setForm({ ...form, variants: form.variants.filter((_, row) => row !== index) })}><X size={15} /></button></div>)}
      </div>
      {formError && <p className="inline-error">{formError}</p>}
      <div className="form-actions"><button type="button" className="button subtle" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : "Create product"}</button></div>
    </form></Panel>}
    <Panel title={`Your catalog · ${products.length}`} action={<label className="table-search"><Search size={15} /><input placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}>
      {error ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>VARIANTS & STOCK</th><th>STATUS</th><th /></tr></thead><tbody>
        {visible.map((product) => {
          const totalStock = product.variants.reduce((total, variant) => total + variant.stock, 0);
          return <tr key={product._id}><td><div className="business-cell">{product.imageUrl ? <img className="product-thumb" src={product.imageUrl} alt="" /> : <span className="square-logo">PR</span>}<div><b>{product.name}</b><small>{product.variants.length} stock variants</small></div></div></td><td>{product.category}</td><td><b>{money(product.price)}</b></td><td>{totalStock} units</td><td><StatusPill tone={product.status}>{product.status}</StatusPill></td><td><button className="icon-button danger-action" title="Archive product" onClick={() => archive(product)} disabled={product.status === "archived"}><Archive size={16} /></button></td></tr>;
        })}
        {!visible.length && <tr><td colSpan="6" className="empty-table">{products.length ? "No products match your search." : "Your catalog is empty. Add a product to get started."}</td></tr>}
      </tbody></table></div>}
    </Panel>
  </div>;
}
