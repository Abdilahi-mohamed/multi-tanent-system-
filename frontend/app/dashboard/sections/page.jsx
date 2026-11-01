"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { api } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const emptySection = { name: "", description: "", imageUrl: "", displayOrder: "0", active: true };

export default function ProductSectionsPage() {
  const [sections, setSections] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptySection);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [sectionResult, productResult] = await Promise.all([
        api("/tenant/sections"),
        api("/tenant/products?limit=100")
      ]);
      setSections(sectionResult.items);
      setProducts(productResult.items);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm(section = null) {
    setEditingId(section?._id || "");
    setForm(section ? {
      name: section.name,
      description: section.description || "",
      imageUrl: section.imageUrl || "",
      displayOrder: String(section.displayOrder || 0),
      active: section.active
    } : emptySection);
    setFormError("");
    setShowForm(true);
  }

  async function saveSection(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const url = editingId ? `/tenant/sections/${editingId}` : "/tenant/sections";
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

  async function updateSection(section, changes) {
    try {
      await api(`/tenant/sections/${section._id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function reorderSection(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= visibleSections.length) return;
    const current = visibleSections[index];
    const target = visibleSections[targetIndex];
    try {
      await Promise.all([
        api(`/tenant/sections/${current._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: target.displayOrder }) }),
        api(`/tenant/sections/${target._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: current.displayOrder }) })
      ]);
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function removeSection(section) {
    if (!window.confirm(`Delete "${section.name}"? Sections containing products cannot be deleted.`)) return;
    try {
      await api(`/tenant/sections/${section._id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  const visibleSections = sections.filter((section) =>
    `${section.name} ${section.description}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return <div className="page-content">
    <PageHeader eyebrow="CATALOG ORGANIZATION" title="Product Sections" description="Organize storefront products into sections. Add products directly to the section where they belong." actions={<button className="button primary" onClick={() => openForm()}><Plus size={15} /> New section</button>} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {showForm && <Panel title={editingId ? "Edit section" : "Create section"} className="form-panel">
      <form className="product-form" onSubmit={saveSection}>
        <div className="form-grid">
          <label>Section name<input required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Display order<input type="number" min="0" max="10000" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} /></label>
          <label className="wide-field">Description<textarea rows="2" maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="wide-field">Section image URL <span className="optional-text">Optional</span><input type="url" maxLength="1000" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /></label>
          <label className="section-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active on public storefront</label>
        </div>
        {formError && <p className="inline-error" role="alert">{formError}</p>}
        <div className="form-actions"><button type="button" className="button subtle" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create section"}</button></div>
      </form>
    </Panel>}
    <Panel title={`Your sections · ${sections.length}`} action={<label className="table-search"><Search size={15} /><input placeholder="Search sections" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}>
      {loading ? <LoadingState /> : visibleSections.length ? <div className="section-grid">
        {visibleSections.map((section, index) => {
          const sectionProducts = products.filter((product) => (product.sectionId?._id || product.sectionId) === section._id);
          return <article className="section-card" key={section._id}>
            <header className="section-card-heading">
              {section.imageUrl ? <img src={section.imageUrl} alt="" /> : <span className="section-placeholder"><Archive size={18} /></span>}
              <div><h2>{section.name}</h2><p>{section.description || "No section description."}</p></div>
              <StatusPill tone={section.active ? "active" : "inactive"}>{section.active ? "Active" : "Inactive"}</StatusPill>
            </header>
            <div className="section-card-products">
              <b>{sectionProducts.length} products</b>
              {sectionProducts.length ? sectionProducts.slice(0, 4).map((product) => <a href={`/dashboard/products?sectionId=${section._id}&productId=${product._id}`} key={product._id}>{product.name}<small>{product.status === "archived" ? "Archived" : product.isPublished ? "Published" : "Draft"}</small></a>) : <p>No products in this section yet.</p>}
              {sectionProducts.length > 4 && <small>and {sectionProducts.length - 4} more</small>}
            </div>
            <footer className="section-card-actions">
              <a className="button primary compact" href={`/dashboard/products?sectionId=${section._id}&add=1`}><Plus size={13} /> Add product</a>
              <button className="button subtle compact" onClick={() => openForm(section)}>Edit section</button>
              <button className="icon-button danger-action" title="Move section up" aria-label="Move section up" disabled={index === 0} onClick={() => reorderSection(index, -1)}><ArrowUp size={14} /></button>
              <button className="icon-button danger-action" title="Move section down" aria-label="Move section down" disabled={index === visibleSections.length - 1} onClick={() => reorderSection(index, 1)}><ArrowDown size={14} /></button>
              <button className="button subtle compact" onClick={() => updateSection(section, { active: !section.active })}>{section.active ? "Deactivate" : "Activate"}</button>
              <button className="icon-button danger-action" title="Delete section" aria-label="Delete section" onClick={() => removeSection(section)}><X size={14} /></button>
            </footer>
          </article>;
        })}
      </div> : <div className="empty-state">{sections.length ? "No sections match your search." : "Create your first section, then add products to it."}</div>}
    </Panel>
  </div>;
}
