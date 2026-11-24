"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowDown, ArrowUp, ImagePlus, Plus, Search, X } from "lucide-react";
import { api } from "../../../lib/api";
import { prepareImage } from "../../../lib/prepare-image";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const emptyType = { name: "", description: "", imageUrl: "", displayOrder: "0", active: true };
const formatDate = (value) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));

export default function ProductTypesPage() {
  const [types, setTypes] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptyType);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [typeResult, sectionResult] = await Promise.all([
        api("/tenant/product-types"),
        api("/tenant/sections")
      ]);
      setTypes(typeResult.items);
      setSections(sectionResult.items);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm(productType = null) {
    setEditingId(productType?._id || "");
    setForm(productType ? {
      name: productType.name,
      description: productType.description || "",
      imageUrl: productType.imageUrl || "",
      displayOrder: String(productType.displayOrder || 0),
      active: productType.active
    } : emptyType);
    setFormError("");
    setShowForm(true);
  }

  async function saveType(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const url = editingId ? `/tenant/product-types/${editingId}` : "/tenant/product-types";
      await api(url, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, displayOrder: Number(form.displayOrder) })
      });
      setShowForm(false);
      await load();
    } catch (reason) {
      setFormError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadTypeImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormError("");
    try {
      const imageUrl = await prepareImage(file, 1200);
      setForm((current) => ({ ...current, imageUrl }));
    } catch (reason) {
      setFormError(reason.message);
    } finally {
      event.target.value = "";
    }
  }

  async function updateType(productType, changes) {
    try {
      await api(`/tenant/product-types/${productType._id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function reorderType(productType, direction) {
    const index = visibleTypes.findIndex((item) => item._id === productType._id);
    const target = visibleTypes[index + direction];
    if (!target) return;
    const low = Math.min(productType.displayOrder, target.displayOrder);
    const high = Math.max(productType.displayOrder, target.displayOrder);
    const productTypeOrder = low === high ? (direction < 0 ? low : high + 1) : direction < 0 ? low : high;
    const targetOrder = low === high ? (direction < 0 ? high + 1 : low) : direction < 0 ? high : low;
    try {
      await Promise.all([
        api(`/tenant/product-types/${productType._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: productTypeOrder }) }),
        api(`/tenant/product-types/${target._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: targetOrder }) })
      ]);
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function removeType(productType) {
    if (!window.confirm(`Delete "${productType.name}"? Types with sections must have those sections removed first.`)) return;
    try {
      await api(`/tenant/product-types/${productType._id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  const visibleTypes = types.filter((productType) =>
    `${productType.name} ${productType.description}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return <div className="page-content tenant-product-types-page">
    <PageHeader eyebrow="CATALOG ORGANIZATION" title="Product Types" description="Create the top-level categories that organize your storefront products and sections." actions={<><a className="button subtle" href="/dashboard/sections">Manage sections</a><button className="button primary" onClick={() => openForm()}><Plus size={15} /> New product type</button></>} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {showForm && <Panel title={editingId ? "Edit product type" : "Create product type"} className="form-panel">
      <form className="product-form" onSubmit={saveType}>
        <div className="form-grid">
          <label>Type name<input required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Display order<input type="number" min="0" max="10000" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} /></label>
          <label className="wide-field">Description <span className="optional-text">Optional</span><textarea rows="2" maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="wide-field">Type image URL <span className="optional-text">Optional</span><input type="url" maxLength="1000" value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /></label>
          <label className="wide-field"><span className="catalog-image-upload-label"><ImagePlus size={14} /> Or upload an image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadTypeImage} /></label>
          {form.imageUrl && <div className="wide-field catalog-image-preview"><img src={form.imageUrl} alt="Product type preview" /><button type="button" className="text-link" onClick={() => setForm({ ...form, imageUrl: "" })}>Remove image</button></div>}
          <label className="section-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active on public storefront</label>
        </div>
        {formError && <p className="inline-error" role="alert">{formError}</p>}
        <div className="form-actions"><button type="button" className="button subtle" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create product type"}</button></div>
      </form>
    </Panel>}
    <Panel title={`Your product types · ${types.length}`} action={<label className="table-search"><Search size={15} /><input placeholder="Search product types" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}>
      {loading ? <LoadingState /> : visibleTypes.length ? <div className="section-grid">
        {visibleTypes.map((productType, index) => {
          const typeSections = sections.filter((section) => String(section.typeId?._id || section.typeId || "") === productType._id);
          return <article className="section-card" key={productType._id}>
            <header className="section-card-heading">
              {productType.imageUrl ? <img src={productType.imageUrl} alt="" /> : <span className="section-placeholder"><Archive size={18} /></span>}
              <div><h2>{productType.name}</h2><p>{productType.description || "No type description."}</p></div>
              <StatusPill tone={productType.active ? "active" : "inactive"}>{productType.active ? "Active" : "Inactive"}</StatusPill>
            </header>
            <div className="section-card-products">
              <b>{typeSections.length} sections</b>
              {typeSections.length ? typeSections.map((section) => <span key={section._id}>{section.name}<small>{section.active ? "Active" : "Inactive"}</small></span>) : <p>No sections in this type yet.</p>}
              <small>Created {formatDate(productType.createdAt)}</small>
            </div>
            <footer className="section-card-actions">
              <a className="button primary compact" href={`/dashboard/sections?typeId=${productType._id}`}><Plus size={13} /> Add section</a>
              <button className="button subtle compact" onClick={() => openForm(productType)}>Edit type</button>
              <button className="icon-button danger-action" title="Move type up" aria-label="Move type up" disabled={index === 0} onClick={() => reorderType(productType, -1)}><ArrowUp size={14} /></button>
              <button className="icon-button danger-action" title="Move type down" aria-label="Move type down" disabled={index === visibleTypes.length - 1} onClick={() => reorderType(productType, 1)}><ArrowDown size={14} /></button>
              <button className="button subtle compact" onClick={() => updateType(productType, { active: !productType.active })}>{productType.active ? "Deactivate" : "Activate"}</button>
              <button className="icon-button danger-action" title="Delete product type" aria-label="Delete product type" onClick={() => removeType(productType)}><X size={14} /></button>
            </footer>
          </article>;
        })}
      </div> : <div className="empty-state">{types.length ? "No product types match your search." : "Create your first product type to begin organizing your catalog."}</div>}
    </Panel>
  </div>;
}
