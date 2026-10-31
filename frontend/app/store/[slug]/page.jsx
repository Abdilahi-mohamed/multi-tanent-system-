"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShoppingBag, Store } from "lucide-react";
import { api, money } from "../../../lib/api";

export default function StorefrontPage({ params }) {
  const [slug, setSlug] = useState("");
  const [store, setStore] = useState(null);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const [orderError, setOrderError] = useState("");
  const idempotencyKey = useRef("");

  useEffect(() => { Promise.resolve(params).then((value) => setSlug(value.slug)); }, [params]);
  useEffect(() => {
    if (!slug) return;
    api(`/store/${encodeURIComponent(slug)}`).then((result) => {
      setStore(result);
      setProductId(result.products[0]?._id || "");
      setVariantId(result.products[0]?.variants.find((variant) => variant.stock > 0)?._id || "");
    }).catch((reason) => setError(reason.message));
  }, [slug]);
  const product = useMemo(() => store?.products.find((item) => item._id === productId), [store, productId]);
  const variant = product?.variants.find((item) => item._id === variantId);

  function chooseProduct(id) {
    const selected = store?.products.find((item) => item._id === id);
    setProductId(id);
    setVariantId(selected?.variants.find((item) => item.stock > 0)?._id || "");
    setQuantity(1);
  }
  async function submitOrder(event) {
    event.preventDefault();
    setBusy(true);
    setOrderError("");
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await api(`/store/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ productId, variantId, quantity: Number(quantity), customer })
      });
      setOrder(response.order);
    } catch (reason) { setOrderError(reason.message); }
    finally { setBusy(false); }
  }

  if (error) return <main className="storefront-page"><div className="state-box"><b>Store unavailable</b><p>{error}</p></div></main>;
  if (!store) return <main className="storefront-page"><div className="screen-message">Loading storefront…</div></main>;
  return <main className="storefront-page">
    <header className="storefront-header"><a href={`/store/${slug}`} className="store-brand"><span className="brand-mark">A</span><span><b>{store.tenant.name}</b><small>{store.tenant.category}</small></span></a><span className="store-secure"><Store size={14} /> Independent storefront</span></header>
    <section className="store-intro"><p className="eyebrow">WELCOME TO {store.tenant.name.toUpperCase()}</p><h1>{store.tenant.name}</h1><p>{store.tenant.description || "Discover products from this independent business."}</p></section>
    {order ? <section className="order-confirmation"><CheckCircle2 size={32} /><h2>Order received</h2><p>Your order <b>{order.orderNumber}</b> was saved for this store.</p><div className="confirmation-details"><span>Amount</span><b>{money(order.total)}</b><span>Payment</span><b className="warning-text">Pending verification</b></div><p className="footnote">No payment provider is connected. The store owner will contact you to arrange payment. This order is not marked paid.</p>    <button className="button subtle" onClick={() => { idempotencyKey.current = ""; setOrder(null); }}>Continue shopping</button></section> : <div className="storefront-grid">
      <section><div className="store-section-head"><div><p className="eyebrow">THE COLLECTION</p><h2>Shop products</h2></div><span>{store.products.length} items</span></div>
        {store.products.length ? <div className="store-product-grid">{store.products.map((item) => <button className={`store-product ${productId === item._id ? "selected" : ""}`} onClick={() => chooseProduct(item._id)} key={item._id}><div className="store-product-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <ShoppingBag size={26} />}</div><div className="store-product-copy"><small>{item.category}</small><b>{item.name}</b><span>{money(item.price)}</span></div></button>)}</div> : <div className="empty-state">This store has no available products.</div>}
      </section>
      <section className="checkout-card"><p className="eyebrow">SECURE ORDER</p><h2>Complete your order</h2>{product ? <><div className="checkout-product"><b>{product.name}</b><span>{money(product.price)} each</span></div><form onSubmit={submitOrder}>
        <label>Product option<select required value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">Choose available option</option>{product.variants.map((item) => <option value={item._id} disabled={item.stock < 1} key={item._id}>{[item.size, item.color, item.sku].filter(Boolean).join(" / ") || "Standard"} · {item.stock} in stock</option>)}</select></label>
        <label>Quantity<input type="number" min="1" max={Math.min(50, variant?.stock || 1)} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <div className="checkout-divider" /><p className="checkout-total"><span>Items subtotal</span><b>{money((product.price || 0) * Number(quantity || 0))}</b></p><p className="payment-method-note">Delivery fees are not configured and may be confirmed by the merchant. Online payments are unavailable; arrange payment directly with the merchant.</p>
        <h3>Delivery details</h3>
        <label>Full name<input required minLength="2" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
        <label>Phone number<input required value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
        <label>Delivery address<input required minLength="5" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>
        <label>Delivery instructions <span className="optional-text">Optional</span><textarea rows="2" value={customer.instructions} onChange={(event) => setCustomer({ ...customer, instructions: event.target.value })} /></label>
        {orderError && <p className="inline-error">{orderError}</p>}
        <button className="button primary full-width" type="submit" disabled={busy || !variantId || !store.products.length}>{busy ? "Placing order…" : "Place order · payment pending"}</button>
      </form></> : <div className="empty-state">Choose an available product to continue.</div>}</section>
    </div>}
    <footer className="storefront-footer">Store orders are created by the business backend. Payment verification is not available until a provider is configured.</footer>
  </main>;
}
