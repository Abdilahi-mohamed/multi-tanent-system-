"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Plus, Search, X } from "lucide-react";
import { api, money } from "../../../lib/api";
import { LoadingState, PageHeader, Panel, StatusPill } from "../../../components/AppShell";

const blankVariant = () => ({ _id: "", sku: "", size: "", color: "", attributes: [], stock: "0", price: "", imageUrl: "" });
const blankProduct = (sectionId = "") => ({
  name: "", description: "", category: "", sectionId, price: "", promotionalPrice: "", imageUrl: "", imagesText: "", isPublished: true,
  variants: [blankVariant()]
});

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(blankProduct());
  const queryHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      const [productResult, sectionResult] = await Promise.all([
        api("/tenant/products?limit=100"),
        api("/tenant/sections")
      ]);
      setProducts(productResult.items);
      setSections(sectionResult.items);
      setError("");
      if (!queryHandled.current) {
        queryHandled.current = true;
        const params = new URLSearchParams(window.location.search);
        const requestedSection = params.get("sectionId") || "";
        setSectionFilter(requestedSection);
        if (params.size) window.history.replaceState({}, "", window.location.pathname);
        if (params.get("add") === "1") {
          setEditingId("");
          setForm(blankProduct(requestedSection));
          setShowForm(true);
        } else if (params.get("productId")) {
          const product = productResult.items.find((item) => item._id === params.get("productId"));
          if (product) openProductEditor(product, requestedSection);
        }
      }
    } catch (reason) {
      setError(reason.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openProductEditor(product, preferredSection = "") {
    setEditingId(product._id);
    setForm({
      name: product.name,
      description: product.description || "",
      category: product.category || "",
      sectionId: preferredSection || product.sectionId?._id || product.sectionId || "",
      price: String(product.price),
      promotionalPrice: product.promotionalPrice == null ? "" : String(product.promotionalPrice),
      imageUrl: product.imageUrl || "",
      imagesText: (product.images || []).join("\n"),
      isPublished: product.isPublished !== false,
      variants: product.variants.map((variant) => ({
        _id: variant._id,
        sku: variant.sku || "", size: variant.size || "", color: variant.color || "",
        attributes: (variant.attributes || []).map(({ name, value }) => ({ name, value })),
        stock: String(variant.stock), price: variant.price == null ? "" : String(variant.price),
        imageUrl: variant.imageUrl || ""
      }))
    });
    setShowForm(true);
    setFormError("");
  }

  function setVariant(index, key, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, row) => row === index ? { ...variant, [key]: value } : variant)
    }));
  }

  function setVariantAttribute(variantIndex, attributeIndex, key, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, row) => row === variantIndex
        ? {
          ...variant,
          attributes: variant.attributes.map((attribute, index) => index === attributeIndex
            ? { ...attribute, [key]: value }
            : attribute)
        }
        : variant)
    }));
  }

  async function saveProduct(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const images = form.imagesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const payload = {
        name: form.name,
        description: form.description,
        category: sections.find((section) => section._id === form.sectionId)?.name || form.category || "General",
        sectionId: form.sectionId || null,
        price: Number(form.price),
        promotionalPrice: form.promotionalPrice === "" ? null : Number(form.promotionalPrice),
        imageUrl: form.imageUrl.trim() || images[0] || "",
        images,
        isPublished: form.isPublished,
        variants: form.variants.map((variant) => ({
          ...(variant._id ? { _id: variant._id } : {}),
          sku: variant.sku.trim(),
          size: variant.size.trim(),
          color: variant.color.trim(),
          attributes: variant.attributes
            .map(({ name, value }) => ({ name: name.trim(), value: value.trim() }))
            .filter(({ name, value }) => name && value),
          stock: Number(variant.stock),
          price: variant.price === "" ? null : Number(variant.price),
          imageUrl: variant.imageUrl.trim()
        }))
      };
      await api(editingId ? `/tenant/products/${editingId}` : "/tenant/products", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setShowForm(false);
      setEditingId("");
      setNotice(editingId ? "Product updated." : "Product created.");
      await load();
    } catch (reason) {
      setFormError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(product) {
    if (!window.confirm(`Archive ${product.name}? It will no longer appear in your storefront.`)) return;
    try {
      await api(`/tenant/products/${product._id}/archive`, { method: "PATCH", body: "{}" });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function setPublished(product) {
    try {
      await api(`/tenant/products/${product._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: product.isPublished === false })
      });
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  const visible = products.filter((product) => {
    const matchesText = `${product.name} ${product.category} ${product.sectionId?.name || ""}`.toLowerCase().includes(search.toLowerCase());
    const productSectionId = product.sectionId?._id || product.sectionId || "";
    return matchesText && (!sectionFilter || productSectionId === sectionFilter);
  });
  const selectedSection = sections.find((section) => section._id === form.sectionId);

  return <div className="page-content">
    <PageHeader eyebrow="CATALOG & STOCK" title="Products & variants" description="Manage product details, configurable variants, images, publication, and variant-level inventory." actions={<><a className="button subtle" href="/dashboard/sections">Manage sections</a><button className="button primary" onClick={() => { setEditingId(""); setForm(blankProduct(sectionFilter)); setShowForm(!showForm); }}><Plus size={16} /> Add product</button></>} />
    {notice && <div className="inline-success">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    {showForm && <Panel title={editingId ? `Edit product${selectedSection ? ` · ${selectedSection.name}` : ""}` : `Create product${selectedSection ? ` · ${selectedSection.name}` : ""}`} className="form-panel">
      <form onSubmit={saveProduct} className="product-form">
        <div className="form-grid">
          <label>Product name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Product section<select value={form.sectionId} onChange={(event) => setForm({ ...form, sectionId: event.target.value })}><option value="">Unassigned / legacy category</option>{sections.map((section) => <option value={section._id} disabled={!section.active} key={section._id}>{section.name}{section.active ? "" : " (inactive)"}</option>)}</select></label>
          <label>Price (USD)<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
          <label>Promotional price (USD) <span className="optional-text">Optional</span><input type="number" min="0" step="0.01" value={form.promotionalPrice} onChange={(event) => setForm({ ...form, promotionalPrice: event.target.value })} /></label>
          {!form.sectionId && <label>Category<input maxLength="80" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Apparel" /></label>}
          <label className="wide-field">Description<textarea rows="2" maxLength="3000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="wide-field">Primary image URL<input type="url" maxLength="1000" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…" /></label>
          <label className="wide-field">Additional product image URLs <span className="optional-text">One URL per line</span><textarea rows="3" maxLength="12000" value={form.imagesText} onChange={(event) => setForm({ ...form, imagesText: event.target.value })} placeholder={"https://example.com/image-front.jpg\nhttps://example.com/image-back.jpg"} /></label>
          <label className="section-active-toggle"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm({ ...form, isPublished: event.target.checked })} /> Published on public storefront</label>
        </div>
        <div className="variant-builder">
          <div className="variant-builder-heading"><b>Variants and stock</b><button type="button" className="text-link" onClick={() => setForm({ ...form, variants: [...form.variants, blankVariant()] })}><Plus size={14} /> Add variant</button></div>
          {form.variants.map((variant, index) => <div className="variant-editor" key={variant._id || index}>
            <div className="variant-input-row">
              <input aria-label="SKU" placeholder="SKU" value={variant.sku} onChange={(event) => setVariant(index, "sku", event.target.value)} />
              <input aria-label="Size or option" placeholder="Size / option" value={variant.size} onChange={(event) => setVariant(index, "size", event.target.value)} />
              <input aria-label="Color" placeholder="Color" value={variant.color} onChange={(event) => setVariant(index, "color", event.target.value)} />
              <input aria-label="Stock quantity" placeholder="Stock" type="number" min="0" required value={variant.stock} onChange={(event) => setVariant(index, "stock", event.target.value)} />
              <button type="button" className="icon-button danger-action" aria-label="Remove variant" title={variant._id ? "Saved variants are retained for order and inventory history." : "Remove new variant"} disabled={form.variants.length === 1 || Boolean(variant._id)} onClick={() => setForm({ ...form, variants: form.variants.filter((_, row) => row !== index) })}><X size={15} /></button>
            </div>
            <div className="variant-attributes">
              <div className="variant-builder-heading"><b>Other options</b><button type="button" className="text-link" onClick={() => setForm((current) => ({ ...current, variants: current.variants.map((item, row) => row === index ? { ...item, attributes: [...item.attributes, { name: "", value: "" }] } : item) }))}><Plus size={13} /> Add attribute</button></div>
              {variant.attributes.map((attribute, attributeIndex) => <div className="variant-attribute-row" key={attributeIndex}>
                <input aria-label={`Variant ${index + 1} attribute name`} placeholder="Attribute (e.g. Storage)" maxLength="40" value={attribute.name} onChange={(event) => setVariantAttribute(index, attributeIndex, "name", event.target.value)} />
                <input aria-label={`Variant ${index + 1} attribute value`} placeholder="Value (e.g. 256 GB)" maxLength="80" value={attribute.value} onChange={(event) => setVariantAttribute(index, attributeIndex, "value", event.target.value)} />
                <button type="button" className="icon-button danger-action" aria-label="Remove attribute" onClick={() => setForm((current) => ({ ...current, variants: current.variants.map((item, row) => row === index ? { ...item, attributes: item.attributes.filter((_, attributeRow) => attributeRow !== attributeIndex) } : item) }))}><X size={13} /></button>
              </div>)}
            </div>
            <div className="variant-extra-fields"><label>Variant price <span className="optional-text">Optional override</span><input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariant(index, "price", event.target.value)} /></label><label>Variant image URL<input type="url" maxLength="1000" value={variant.imageUrl} onChange={(event) => setVariant(index, "imageUrl", event.target.value)} /></label></div>
          </div>)}
        </div>
        {formError && <p className="inline-error" role="alert">{formError}</p>}
        <div className="form-actions"><button type="button" className="button subtle" onClick={() => { setShowForm(false); setEditingId(""); }}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create product"}</button></div>
      </form>
    </Panel>}
    <Panel title={`Your catalog · ${products.length}`} action={<div className="filter-actions"><label className="table-search"><Search size={15} /><input placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}><option value="">All sections</option>{sections.map((section) => <option value={section._id} key={section._id}>{section.name}</option>)}</select></div>}>
      {error && !products.length ? <LoadingState error={error} retry={load} /> : <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SECTION</th><th>PRICE</th><th>VARIANTS & STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
        {visible.map((product) => {
          const totalStock = product.variants.reduce((total, variant) => total + variant.stock, 0);
          const sectionName = product.sectionId?.name || product.category || "Unassigned";
          return <tr key={product._id}><td><div className="business-cell">{(product.imageUrl || product.images?.[0]) ? <img className="product-thumb" src={product.imageUrl || product.images[0]} alt="" /> : <span className="square-logo">PR</span>}<div><b>{product.name}</b><small>{product.variants.length} stock variants</small></div></div></td><td>{sectionName}</td><td><b>{money(product.promotionalPrice ?? product.price)}</b>{product.promotionalPrice != null && <small className="table-subline"><s>{money(product.price)}</s></small>}</td><td>{totalStock} units</td><td><StatusPill tone={product.status === "archived" ? "inactive" : product.isPublished === false ? "pending" : "active"}>{product.status === "archived" ? "archived" : product.isPublished === false ? "draft" : "published"}</StatusPill></td><td><div className="table-row-actions"><button className="button subtle compact" onClick={() => openProductEditor(product)}>Edit</button><button className="button subtle compact" onClick={() => setPublished(product)} disabled={product.status === "archived"}>{product.isPublished === false ? "Publish" : "Unpublish"}</button><button className="icon-button danger-action" title="Archive product" onClick={() => archive(product)} disabled={product.status === "archived"}><Archive size={16} /></button></div></td></tr>;
        })}
        {!visible.length && <tr><td colSpan="6" className="empty-table">{products.length ? "No products match your search." : "Your catalog is empty. Add a product or start in Product Sections."}</td></tr>}
      </tbody></table></div>}
    </Panel>
  </div>;
}
