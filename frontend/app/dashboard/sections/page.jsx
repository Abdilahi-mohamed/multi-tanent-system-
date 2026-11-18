"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowDown, ArrowUp, ImagePlus, Plus, Search, X } from "lucide-react";
import { api } from "../../../lib/api";
import { prepareImage } from "../../../lib/prepare-image";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const emptySection = { typeId: "", name: "", description: "", imageUrl: "", displayOrder: "0", active: true };

export default function ProductSectionsPage() {
  const [sections, setSections] = useState([]);
  const [types, setTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptySection);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const [sectionResult, productResult, typeResult] = await Promise.all([
        api("/tenant/sections"),
        api("/tenant/products?limit=100"),
        api("/tenant/product-types")
      ]);
      setSections(sectionResult.items);
      setProducts(productResult.items);
      setTypes(typeResult.items);
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get("typeId");
    if (requestedType) {
      setTypeFilter(requestedType);
      setForm({ ...emptySection, typeId: requestedType });
      setShowForm(true);
    }
  }, []);

  function openForm(section = null) {
    setEditingId(section?._id || "");
    setForm(section ? {
      typeId: section.typeId?._id || section.typeId || "",
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

  async function uploadSectionImage(event) {
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

  async function updateSection(section, changes) {
    try {
      await api(`/tenant/sections/${section._id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function reorderSection(current, direction) {
    const siblings = visibleSections.filter((section) =>
      String(section.typeId?._id || section.typeId || "") === String(current.typeId?._id || current.typeId || "")
    );
    const index = siblings.findIndex((section) => section._id === current._id);
    const target = siblings[index + direction];
    if (!target) return;
    const low = Math.min(current.displayOrder, target.displayOrder);
    const high = Math.max(current.displayOrder, target.displayOrder);
    const currentOrder = low === high ? (direction < 0 ? low : high + 1) : direction < 0 ? low : high;
    const targetOrder = low === high ? (direction < 0 ? high + 1 : low) : direction < 0 ? high : low;
    try {
      await Promise.all([
        api(`/tenant/sections/${current._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: currentOrder }) }),
        api(`/tenant/sections/${target._id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: targetOrder }) })
      ]);
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function removeSection(section) {
    if (!window.confirm(`Delete "${section.name}"? Move all products to another section before deleting this one.`)) return;
    try {
      await api(`/tenant/sections/${section._id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  const visibleSections = sections.filter((section) =>
    (!typeFilter || String(section.typeId?._id || section.typeId || "") === typeFilter)
      && `${section.name} ${section.description}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return <div className="page-content tenant-sections-page">
    <PageHeader eyebrow="CATALOG ORGANIZATION" title="Product Sections" description="Organize storefront products inside their parent product types. Add products directly to the section where they belong." actions={<><a className="button subtle" href="/dashboard/product-types">Manage product types</a><button className="button primary" onClick={() => openForm()}><Plus size={15} /> New section</button></>} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {showForm && <Panel title={editingId ? "Edit section" : "Create section"} className="form-panel">
      <form className="product-form" onSubmit={saveSection}>
        <div className="form-grid">
          <label>Product type<select required value={form.typeId} onChange={(event) => setForm({ ...form, typeId: event.target.value })}><option value="">Select a product type</option>{types.map((productType) => <option value={productType._id} key={productType._id}>{productType.name}{productType.active ? "" : " (inactive)"}</option>)}</select></label>
          <label>Section name<input required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Display order<input type="number" min="0" max="10000" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} /></label>
          <label className="wide-field">Description<textarea rows="2" maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="wide-field">Section image URL <span className="optional-text">Optional</span><input type="url" maxLength="1000" value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /></label>
          <label className="wide-field"><span className="catalog-image-upload-label"><ImagePlus size={14} /> Or upload an image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadSectionImage} /></label>
          {form.imageUrl && <div className="wide-field catalog-image-preview"><img src={form.imageUrl} alt="Product section preview" /><button type="button" className="text-link" onClick={() => setForm({ ...form, imageUrl: "" })}>Remove image</button></div>}
          <label className="section-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active on public storefront</label>
        </div>
        {formError && <p className="inline-error" role="alert">{formError}</p>}
        <div className="form-actions"><button type="button" className="button subtle" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create section"}</button></div>
      </form>
    </Panel>}
    <Panel title={`Your sections · ${sections.length}`} action={<div className="filter-actions"><select aria-label="Filter by product type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All product types</option>{types.map((productType) => <option value={productType._id} key={productType._id}>{productType.name}</option>)}</select><label className="table-search"><Search size={15} /><input placeholder="Search sections" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>}>
      {loading ? <LoadingState /> : visibleSections.length ? <div className="section-grid">
        {visibleSections.map((section) => {
          const sectionProducts = products.filter((product) => (product.sectionId?._id || product.sectionId) === section._id);
          const sectionTypeId = String(section.typeId?._id || section.typeId || "");
          const typeSections = visibleSections.filter((item) => String(item.typeId?._id || item.typeId || "") === sectionTypeId);
          const typeIndex = typeSections.findIndex((item) => item._id === section._id);
          const typeName = types.find((productType) => productType._id === sectionTypeId)?.name || "Unassigned type";
          return <article className="section-card" key={section._id}>
            <header className="section-card-heading">
              {section.imageUrl ? <img src={section.imageUrl} alt="" /> : <span className="section-placeholder"><Archive size={18} /></span>}
              <div><h2>{section.name}</h2><p className="section-type-label">{typeName}</p><p>{section.description || "No section description."}</p></div>
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
              <button className="icon-button danger-action" title="Move section up" aria-label="Move section up" disabled={typeIndex === 0} onClick={() => reorderSection(section, -1)}><ArrowUp size={14} /></button>
              <button className="icon-button danger-action" title="Move section down" aria-label="Move section down" disabled={typeIndex === typeSections.length - 1} onClick={() => reorderSection(section, 1)}><ArrowDown size={14} /></button>
              <button className="button subtle compact" onClick={() => updateSection(section, { active: !section.active })}>{section.active ? "Deactivate" : "Activate"}</button>
              <button className="icon-button danger-action" title="Delete section" aria-label="Delete section" onClick={() => removeSection(section)}><X size={14} /></button>
            </footer>
          </article>;
        })}
      </div> : <div className="empty-state">{sections.length ? "No sections match your search." : "Create your first section, then add products to it."}</div>}
    </Panel>
  </div>;
}
