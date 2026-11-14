"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, Search, Send, ShoppingBag, Store, X } from "lucide-react";
import { api, money } from "../../../lib/api";
import { StoreSupportChat, StoreSupportNotifications } from "../../../components/StoreSupportChat";

const accessKey = (slug) => `aura-order-chat-${slug}`;
const cartKey = (slug) => `vendora-store-cart-${slug}`;
const chatDate = (value) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function attributesForVariant(variant) {
  const attributes = [];
  if (variant.size) attributes.push({ name: "Size", value: variant.size });
  if (variant.color) attributes.push({ name: "Color", value: variant.color });
  for (const attribute of variant.attributes || []) {
    if (!attributes.some((item) => item.name.toLowerCase() === attribute.name.toLowerCase())) {
      attributes.push(attribute);
    }
  }
  return attributes;
}

function variantSummary(variant) {
  return [
    ...attributesForVariant(variant).map(({ name, value }) => `${name}: ${value}`),
    variant.sku
  ].filter(Boolean).join(" · ");
}

export default function StorefrontPage({ params }) {
  const [slug, setSlug] = useState("");
  const [store, setStore] = useState(null);
  const [error, setError] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState([]);
  const [cartReady, setCartReady] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", location: "", instructions: "" });
  const [customerAccount, setCustomerAccount] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pay_on_delivery");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const [orderError, setOrderError] = useState("");
  const [chatToken, setChatToken] = useState("");
  const [chat, setChat] = useState(null);
  const [chatBody, setChatBody] = useState("");
  const [accessForm, setAccessForm] = useState({ orderNumber: "", name: "", phone: "" });
  const [chatError, setChatError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [supportTab, setSupportTab] = useState("order");
  const idempotencyKey = useRef("");
  const storeLoaded = useRef(false);

  useEffect(() => { Promise.resolve(params).then((value) => setSlug(value.slug)); }, [params]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const googleError = query.get("customerAuthError");
    if (googleError === "google_not_configured") {
      setAuthError("Google sign-in is not configured for this store yet.");
    } else if (googleError === "google_account_conflict") {
      setAuthError("This Google account conflicts with an existing customer account. Sign in with email or contact support.");
    } else if (googleError) {
      setAuthError("Google sign-in could not be completed. Please try again.");
    }
  }, []);
  const loadOrderChat = useCallback(async (token) => {
    const result = await api("/customer/order-chat", { headers: { Authorization: `Bearer ${token}` } });
    setChat(result);
    setOrder(result.order);
  }, []);

  const refreshStorefront = useCallback(async (isCurrent) => {
    const result = await api(`/store/${encodeURIComponent(slug)}`);
    if (!isCurrent()) return;
    if (result.canonicalSlug && result.canonicalSlug !== slug) {
      const savedCart = window.sessionStorage.getItem(cartKey(slug));
      if (savedCart) window.sessionStorage.setItem(cartKey(result.canonicalSlug), savedCart);
      const savedChatAccess = window.localStorage.getItem(accessKey(slug));
      if (savedChatAccess) window.localStorage.setItem(accessKey(result.canonicalSlug), savedChatAccess);
      window.location.replace(`/store/${encodeURIComponent(result.canonicalSlug)}${window.location.search}${window.location.hash}`);
      return;
    }
    storeLoaded.current = true;
    setStore(result);
    setProductId((current) => result.products.some((item) => item._id === current)
      ? current
      : result.products[0]?._id || "");
    setVariantId((current) => result.products.some((item) =>
      item.variants.some((option) => option._id === current && option.stock > 0))
      ? current
      : "");
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    let timer;
    let loadStore;
    let onVisibilityChange;
    storeLoaded.current = false;
    setStore(null);
    setError("");
    setSectionId("");
    setProductId("");
    setVariantId("");
    setCart([]);
    setCartReady(false);
    setOrder(null);
    setChatToken("");
    setChat(null);
    setChatError("");
    setCustomerAccount(null);
    setCustomer({ name: "", phone: "", email: "", address: "", location: "", instructions: "" });
    const initializeStorefront = async () => {
      let account = null;
      try {
        const result = await api("/customer/auth/me");
        account = result.customer;
      } catch (reason) {
        if (!active) return;
        if (reason.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        setError(reason.message);
        return;
      }
      if (!active) return;
      setCustomerAccount(account);
      if (account) {
        setCustomer((current) => ({
          ...current,
          name: current.name || account.name,
          email: account.email
        }));
      }
      const savedCart = window.sessionStorage.getItem(cartKey(slug));
      if (savedCart) {
        try {
          const parsedCart = JSON.parse(savedCart);
          setCart(Array.isArray(parsedCart) ? parsedCart : []);
        } catch {
          window.sessionStorage.removeItem(cartKey(slug));
        }
      }
      setCartReady(true);
      idempotencyKey.current = "";
      loadStore = async () => {
        try {
          await refreshStorefront(() => active);
          if (!active) return;
          setError("");
        } catch (reason) {
          if (active && !storeLoaded.current) setError(reason.message);
        }
      };
      loadStore();
      timer = window.setInterval(loadStore, 5000);
      window.addEventListener("focus", loadStore);
      onVisibilityChange = () => {
        if (document.visibilityState === "visible") loadStore();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      const saved = window.localStorage.getItem(accessKey(slug));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.accessToken) {
            setChatToken(parsed.accessToken);
            loadOrderChat(parsed.accessToken).catch(() => {
              if (active) setChatError("Order chat access expired. Verify your order details to continue.");
            });
          }
        } catch {
          window.localStorage.removeItem(accessKey(slug));
        }
      }
    };
    initializeStorefront();
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
      if (loadStore) window.removeEventListener("focus", loadStore);
      if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [slug, loadOrderChat, refreshStorefront]);

  useEffect(() => {
    if (!slug || !cartReady) return;
    if (cart.length) window.sessionStorage.setItem(cartKey(slug), JSON.stringify(cart));
    else window.sessionStorage.removeItem(cartKey(slug));
  }, [cart, cartReady, slug]);

  useEffect(() => {
    if (!store) return;
    if (sectionId && !store.sections.some((section) => section._id === sectionId)) {
      setSectionId("");
      return;
    }
    const sectionProducts = store.products.filter((item) => {
      const id = item.sectionId?._id || item.sectionId || "";
      return !sectionId || id === sectionId;
    });
    if (!sectionProducts.some((item) => item._id === productId)) {
      const first = sectionProducts[0];
      setProductId(first?._id || "");
      setVariantId(first?.variants.find((option) => option.stock > 0)?._id || first?.variants[0]?._id || "");
      setQuantity(1);
    }
  }, [store, sectionId, productId]);

  useEffect(() => {
    if (!chatToken) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api("/customer/order-chat", { headers: { Authorization: `Bearer ${chatToken}` } });
        if (active) { setChat(result); setChatError(""); }
      } catch (reason) {
        if (active) setChatError(reason.message);
      }
    };
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatToken]);

  const productsInSection = useMemo(() => {
    if (!store) return [];
    return store.products.filter((item) => {
      const id = item.sectionId?._id || item.sectionId || "";
      return !sectionId || id === sectionId;
    });
  }, [store, sectionId]);
  const visibleProducts = useMemo(() => productsInSection.filter((item) =>
    `${item.name} ${item.category} ${item.description} ${item.variants.map(variantSummary).join(" ")}`
      .toLowerCase().includes(catalogSearch.trim().toLowerCase())
  ), [productsInSection, catalogSearch]);
  const catalogGroups = useMemo(() => {
    if (!store) return [];
    const groups = store.sections
      .filter((section) => !sectionId || section._id === sectionId)
      .map((section) => ({
        id: section._id,
        title: section.name,
        description: section.description,
        imageUrl: section.imageUrl,
        products: visibleProducts.filter((item) => (item.sectionId?._id || item.sectionId || "") === section._id)
      }));
    if (!sectionId) {
      const categories = [...new Set(visibleProducts
        .filter((item) => !(item.sectionId?._id || item.sectionId))
        .map((item) => item.category || "Other"))];
      groups.push(...categories.map((category) => ({
        id: `category:${category}`,
        title: category,
        description: "",
        products: visibleProducts.filter((item) =>
          !(item.sectionId?._id || item.sectionId) && (item.category || "Other") === category)
      })));
    }
    return groups;
  }, [store, sectionId, visibleProducts]);
  const product = useMemo(() =>
    productsInSection.find((item) => item._id === productId) || productsInSection[0],
  [productsInSection, productId]);
  const variants = product?.variants || [];
  const variant = variants.find((item) => item._id === variantId) || variants.find((item) => item.stock > 0) || variants[0];
  const attributeOptions = [...new Map(variants.flatMap((item) => attributesForVariant(item))
    .map((attribute) => [attribute.name.toLowerCase(), attribute.name])).entries()]
    .map(([key, name]) => ({
      key,
      name,
      values: [...new Set(variants.flatMap((item) => attributesForVariant(item)
        .filter((attribute) => attribute.name.toLowerCase() === key)
        .map((attribute) => attribute.value)))]
    }));
  const attributeValue = (item, key) =>
    attributesForVariant(item).find((attribute) => attribute.name.toLowerCase() === key)?.value || "";
  const matchingOptions = variants.filter((item) =>
    attributeOptions.every(({ key }) => attributeValue(item, key) === attributeValue(variant || {}, key))
  );
  const imageList = product ? [...new Set([variant?.imageUrl, product.imageUrl, ...(product.images || [])].filter(Boolean))] : [];
  const regularPrice = variant?.price ?? product?.price ?? 0;
  const displayPrice = product?.promotionalPrice == null
    ? regularPrice
    : Math.min(regularPrice, product.promotionalPrice);
  const cartTotal = cart.reduce((total, line) => {
    const item = store?.products.find((entry) => entry._id === line.productId);
    const option = item?.variants.find((entry) => entry._id === line.variantId);
    if (!item || !option) return total;
    const regular = option.price ?? item.price;
    const price = item.promotionalPrice == null ? regular : Math.min(regular, item.promotionalPrice);
    return total + price * line.quantity;
  }, 0);
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const stockCount = store.products.reduce((total, item) =>
    total + item.variants.reduce((stock, option) => stock + option.stock, 0), 0);

  function chooseSection(id) {
    setSectionId(id);
    const candidates = id
      ? store?.products.filter((item) => (item.sectionId?._id || item.sectionId || "") === id)
      : store?.products;
    const first = candidates?.[0];
    setProductId(first?._id || "");
    setVariantId(first?.variants.find((item) => item.stock > 0)?._id || first?.variants[0]?._id || "");
    setQuantity(1);
  }

  function chooseProduct(id) {
    const selected = store?.products.find((item) => item._id === id);
    setProductId(id);
    setVariantId(selected?.variants.find((item) => item.stock > 0)?._id || selected?.variants[0]?._id || "");
    setQuantity(1);
  }

  function chooseAttribute(key, value) {
    const matchesValue = variants.filter((item) => attributeValue(item, key) === value);
    const matchesCurrent = matchesValue.filter((item) =>
      attributeOptions.every((attribute) => attribute.key === key
        || !attributeValue(variant || {}, attribute.key)
        || attributeValue(item, attribute.key) === attributeValue(variant || {}, attribute.key))
    );
    const updated = matchesCurrent.find((item) => item.stock > 0) || matchesCurrent[0]
      || matchesValue.find((item) => item.stock > 0) || matchesValue[0];
    setVariantId(updated?._id || "");
    setQuantity(1);
  }

  function addToCart() {
    if (!variant || variant.stock < 1) return;
    const requestedQuantity = Number(quantity);
    const line = cart.find((item) => item.productId === product._id && item.variantId === variant._id);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity + (line?.quantity || 0) > variant.stock) {
      setOrderError("Cart quantity exceeds the available stock for this option.");
      return;
    }
    setCart((current) => line
      ? current.map((item) => item === line ? { ...item, quantity: item.quantity + requestedQuantity } : item)
      : [...current, { productId: product._id, variantId: variant._id, quantity: requestedQuantity }]);
    setOrderError("");
  }

  function updateCartQuantity(line, value) {
    const nextQuantity = Number(value);
    const item = store?.products.find((entry) => entry._id === line.productId);
    const option = item?.variants.find((entry) => entry._id === line.variantId);
    if (!option || !Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > option.stock) return;
    setCart((current) => current.map((entry) => entry === line ? { ...entry, quantity: nextQuantity } : entry));
  }

  function removeCartItem(line) {
    setCart((current) => current.filter((entry) => entry !== line));
  }

  function continueToCustomerLogin() {
    if (cart.length) window.sessionStorage.setItem(cartKey(slug), JSON.stringify(cart));
    const returnTo = `/store/${encodeURIComponent(slug)}?checkout=1`;
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function signOutCustomer() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await api("/customer/auth/logout", { method: "POST" });
      setCustomerAccount(null);
      window.location.assign(`/login?returnTo=${encodeURIComponent(`/store/${slug}`)}`);
    } catch (reason) {
      setAuthError(reason.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!cart.length) {
      setOrderError("Add at least one product option to your cart before placing the order.");
      return;
    }
    if (!customerAccount) {
      setOrderError("Sign in or create a customer account before placing your order.");
      return;
    }
    setBusy(true);
    setOrderError("");
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await api(`/store/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ items: cart.map(({ productId: itemProductId, variantId: itemVariantId, quantity: itemQuantity }) => ({ productId: itemProductId, variantId: itemVariantId, quantity: itemQuantity })), customer, paymentMethod })
      });
      setOrder(response.order);
      setCart([]);
      idempotencyKey.current = "";
      setAccessForm({ orderNumber: response.order.orderNumber, name: customer.name, phone: customer.phone });
      if (response.accessToken) {
        window.localStorage.setItem(accessKey(slug), JSON.stringify({ accessToken: response.accessToken, orderNumber: response.order.orderNumber }));
        setChatToken(response.accessToken);
        try {
          await loadOrderChat(response.accessToken);
        } catch (reason) {
          setChatError(reason.message);
        }
      }
    } catch (reason) {
      if (reason.status === 401) {
        setCustomerAccount(null);
        setAuthError(reason.message);
      }
      setOrderError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOrder(event) {
    event.preventDefault();
    setChatBusy(true);
    setChatError("");
    try {
      const result = await api(`/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(accessForm.orderNumber)}/chat/access`, {
        method: "POST",
        body: JSON.stringify({ name: accessForm.name, phone: accessForm.phone })
      });
      window.localStorage.setItem(accessKey(slug), JSON.stringify({ accessToken: result.accessToken, orderNumber: result.order.orderNumber }));
      setChatToken(result.accessToken);
      setOrder(result.order);
      await loadOrderChat(result.accessToken);
    } catch (reason) {
      setChatError(reason.message);
    } finally {
      setChatBusy(false);
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    if (!chatToken || !chatBody.trim()) return;
    setChatBusy(true);
    setChatError("");
    try {
      const result = await api("/customer/order-chat/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${chatToken}` },
        body: JSON.stringify({ body: chatBody })
      });
      setChatBody("");
      setChat((current) => current ? { ...current, conversation: result.conversation } : current);
    } catch (reason) {
      setChatError(reason.message);
    } finally {
      setChatBusy(false);
    }
  }

  if (error) return <main className="storefront-page"><div className="state-box"><b>Store unavailable</b><p>{error}</p></div></main>;
  if (!store) return <main className="storefront-page"><div className="screen-message">Loading storefront…</div></main>;

  return <main className="storefront-page">
    <header className="storefront-header"><a href={`/store/${slug}`} className="store-brand"><span className="brand-mark">S</span><span><b>{store.tenant.name}</b><small>POWERED BY VENDORA</small></span><span className="store-verified"><CheckCircle2 size={12} /> Verified Store</span></a><div className="storefront-header-actions">{customerAccount ? <a className="store-customer-name" href="/customer/orders">{customerAccount.name} <span>|</span> My Orders</a> : <a className="store-customer-name" href={`/login?returnTo=${encodeURIComponent(`/store/${slug}`)}`}>Sign in</a>}<a className="button subtle compact store-support-link" href="#support-hub"><MessageCircle size={14} /> Support</a><StoreSupportNotifications slug={slug} /><button className="button primary compact store-cart-nav" type="button" onClick={() => document.getElementById("order-configurator")?.scrollIntoView({ behavior: "smooth", block: "start" })}><ShoppingBag size={14} /> Cart ({cartCount})</button>{customerAccount && <button type="button" className="store-signout" onClick={signOutCustomer} disabled={authBusy}>Sign out</button>}</div></header>
    <section className="store-intro"><div className="store-hero-copy"><p className="eyebrow"><span /> WELCOME TO {store.tenant.name.toUpperCase()} OFFICIAL STORE</p><h1>{store.tenant.name}</h1><p>{store.tenant.description || "Discover quality fashion and everyday essentials, delivered directly to your door."}</p></div><div className="store-hero-stats"><div><b>{stockCount}+</b><span>Items in stock</span></div><div><b>24/7</b><span>Order chat support</span></div></div></section>
    {order && <section className="order-confirmation"><CheckCircle2 size={30} /><h2>Order received</h2><p>Your order <b>{order.orderNumber}</b> was saved for this store.</p><div className="confirmation-details"><span>Amount</span><b>{money(order.total)}</b><span>Payment</span><b className="warning-text">Pending verification</b></div><p className="footnote">No payment provider is connected. Your order is not marked paid. Use Order Support below to discuss this order with the business.</p><a className="button subtle" href="/customer/orders">View my orders</a></section>}
    <div className="storefront-grid">
      <section className="store-collection">
        <div className="store-section-head"><div><p className="eyebrow">THE COLLECTION</p><h2>Shop collection</h2></div><span>{visibleProducts.length} of {store.products.length} items</span></div>
        <label className="store-catalog-search"><Search size={16} /><input type="search" aria-label="Search products" placeholder="Search products and options" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} /></label>
        {store.sections?.length > 0 && <nav className="store-section-tabs" aria-label="Product sections">
          <button className={!sectionId ? "selected" : ""} onClick={() => chooseSection("")}>All products</button>
          {store.sections.map((section) => <button className={sectionId === section._id ? "selected" : ""} onClick={() => chooseSection(section._id)} key={section._id}>{section.name}</button>)}
        </nav>}
        <div className="store-catalog-sections">
          {catalogGroups.map((group) => <section className="store-catalog-section" key={group.id}>
            <header className="store-catalog-section-heading">
              {group.imageUrl && <img src={group.imageUrl} alt="" />}
              <div>{group.description && <p className="eyebrow">{sectionId ? "SECTION" : "COLLECTION"}</p>}<h3>{group.title}</h3>{group.description && <p>{group.description}</p>}</div>
              <span>{group.products.length} products</span>
            </header>
            {group.products.length ? <div className="store-product-grid">
              {group.products.map((item) => {
                const prices = item.variants.map((option) => option.price ?? item.price);
                const basePrice = prices.length ? Math.min(item.price, ...prices) : item.price;
                const productPrice = item.promotionalPrice == null ? basePrice : Math.min(basePrice, item.promotionalPrice);
                const optionSummaries = [...new Set(item.variants.filter((option) => option.stock > 0).map(variantSummary).filter(Boolean))];
                return <button className={`store-product ${product?._id === item._id ? "selected" : ""}`} onClick={() => chooseProduct(item._id)} key={item._id}>
                  <div className="store-product-image">{item.imageUrl || item.images?.[0] ? <img src={item.imageUrl || item.images[0]} alt={item.name} /> : <ShoppingBag size={26} />}</div>
                  <div className="store-product-copy">
                    <small>{item.sectionId ? group.title : item.category || group.title}</small><b>{item.name}</b>
                    <span>From {money(productPrice)}</span>
                    {optionSummaries.length > 0 && <div className="store-product-options">{optionSummaries.slice(0, 3).map((summary) => <small key={summary}>{summary}</small>)}{optionSummaries.length > 3 && <small>+{optionSummaries.length - 3} more options</small>}</div>}
                    <small>{item.variants.reduce((total, option) => total + option.stock, 0)} available</small>
                  </div>
                </button>;
              })}
            </div> : <p className="store-empty-section">{catalogSearch ? "No products in this section match your search." : "Products will appear here when they are published."}</p>}
          </section>)}
          {!catalogGroups.length && <div className="empty-state">{store.products.length ? "No products match your search." : "This store has no published products yet."}</div>}
        </div>
      </section>
      <section className="checkout-card" id="order-configurator"><p className="eyebrow">SECURE ORDER</p><h2>Complete your order</h2>{product ? <><div className="checkout-product"><b>{product.name}</b><span>{money(displayPrice)} per unit{displayPrice < regularPrice && <del>{money(regularPrice)}</del>}</span></div>
        {imageList.length > 0 && <div className="store-product-gallery"><img className="store-selected-image" src={imageList[0]} alt={`${product.name}${variantSummary(variant || {}) ? ` · ${variantSummary(variant)}` : ""}`} />{imageList.slice(1).map((url) => <img src={url} alt={product.name} key={url} />)}</div>}
        <form onSubmit={submitOrder}>
          {attributeOptions.map(({ key, name, values }) => <fieldset className="variant-pill-field" key={key}><legend>{name}</legend><div className={`variant-pill-options ${key === "color" ? "color-pills" : ""}`}>{values.map((value) => { const available = variants.some((item) => attributeValue(item, key) === value && item.stock > 0); const selected = attributeValue(variant || {}, key) === value; return <button type="button" className={`variant-pill ${selected ? "selected" : ""}`} data-attribute={key} disabled={!available} aria-pressed={selected} onClick={() => chooseAttribute(key, value)} key={value}>{key === "color" && <i className={`color-dot color-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />}{value}</button>; })}</div></fieldset>)}
          {!attributeOptions.length && <label>Product option<select required value={variant?._id || ""} onChange={(event) => setVariantId(event.target.value)}><option value="">Choose available option</option>{variants.map((item) => <option value={item._id} disabled={item.stock < 1} key={item._id}>{item.sku || "Standard"} · {item.stock} in stock</option>)}</select></label>}
          {matchingOptions.length > 1 && <label>SKU / variant<select value={variantId} onChange={(event) => setVariantId(event.target.value)}>{matchingOptions.map((item) => <option value={item._id} disabled={item.stock < 1} key={item._id}>{item.sku || "Option"} · {item.stock} in stock</option>)}</select></label>}
          <p className="variant-availability">{variant ? `${variant.stock} available${variantSummary(variant) ? ` · ${variantSummary(variant)}` : ""}` : "Choose an available option."}</p>
          <label>Quantity</label><div className="store-quantity-stepper"><button type="button" aria-label="Decrease quantity" disabled={Number(quantity) <= 1} onClick={() => setQuantity((current) => Math.max(1, Number(current) - 1))}>−</button><input type="number" min="1" max={Math.min(50, variant?.stock || 1)} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /><button type="button" aria-label="Increase quantity" disabled={Number(quantity) >= Math.min(50, variant?.stock || 1)} onClick={() => setQuantity((current) => Math.min(Math.min(50, variant?.stock || 1), Number(current) + 1))}>+</button></div>
          <p className="checkout-selected-subtotal"><span>Selected subtotal</span><b>{money(displayPrice * (Number(quantity) || 0))}</b></p>
          <button className="button subtle full-width store-add-to-cart" type="button" disabled={!variant || variant.stock < 1} onClick={addToCart}><ShoppingBag size={14} /> Add selected option to cart</button>
          {cart.length > 0 && <div className="store-cart"><div className="store-cart-heading"><b>Your cart</b><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>{cart.map((line) => { const cartProduct = store.products.find((item) => item._id === line.productId); const cartVariant = cartProduct?.variants.find((item) => item._id === line.variantId); const optionPrice = cartProduct?.promotionalPrice == null ? (cartVariant?.price ?? cartProduct?.price ?? 0) : Math.min(cartVariant?.price ?? cartProduct?.price ?? 0, cartProduct.promotionalPrice); return <div className="store-cart-line" key={`${line.productId}:${line.variantId}`}><span><b>{cartProduct?.name}</b><small>{variantSummary(cartVariant || {}) || "Standard"} · {money(optionPrice)} each</small></span><input aria-label={`Quantity of ${cartProduct?.name}`} type="number" min="1" max={cartVariant?.stock || 1} value={line.quantity} onChange={(event) => updateCartQuantity(line, event.target.value)} /><button type="button" className="icon-button danger-action" aria-label={`Remove ${cartProduct?.name}`} onClick={() => removeCartItem(line)}><X size={14} /></button></div>; })}<p className="checkout-total"><span>Cart subtotal</span><b>{money(cartTotal)}</b></p></div>}
          <div className="checkout-divider" /><p className="checkout-total"><span>Items subtotal</span><b>{money(cartTotal)}</b></p>
          {customerAccount ? <>
            <div className="customer-account-checkout"><span>Signed in as <b>{customerAccount.email}</b></span><a href="/customer/orders">My orders</a><button type="button" className="text-link" onClick={signOutCustomer} disabled={authBusy}>Sign out</button></div>
            <p className="payment-method-note">Online payment processing is not configured. Orders remain pending until the business verifies payment.</p>
            <h3>Delivery details</h3>
            <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="pay_on_delivery">Pay on delivery / arrange with merchant</option><option value="mobile_money">Mobile money (manual verification)</option><option value="bank_transfer">Bank transfer (manual verification)</option></select></label>
            <label>Full name<input required minLength="2" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
            <label>Phone number<input required value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
            <label>Email<input type="email" readOnly value={customerAccount.email} /></label>
            <label>Delivery location <span className="optional-text">Optional</span><input value={customer.location} onChange={(event) => setCustomer({ ...customer, location: event.target.value })} /></label>
            <label>Delivery address<input required minLength="5" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>
            <label>Delivery instructions <span className="optional-text">Optional</span><textarea rows="2" value={customer.instructions} onChange={(event) => setCustomer({ ...customer, instructions: event.target.value })} /></label>
          </> : cart.length > 0 ? <section className={`customer-auth-panel ${store.tenant.loginPage?.formStyle === "minimal" ? "custom-login-minimal" : ""}`} style={{ "--login-primary": store.tenant.loginPage?.primaryColor || "#2563EB", "--login-secondary": store.tenant.loginPage?.secondaryColor || "#1F2937" }}>
            {store.tenant.loginPage?.logo && <img className="store-login-logo" src={store.tenant.loginPage.logo} alt={`${store.tenant.loginPage.companyName || store.tenant.name} logo`} />}
            <h3>{store.tenant.loginPage?.heading || `Sign in to ${store.tenant.name}`}</h3>
            <p>{store.tenant.loginPage?.welcomeMessage || "Sign in or create an account to place your order and track it later."}</p>
            {authError && <p className="inline-error" role="alert">{authError}</p>}
            <p className="payment-method-note">Your cart will be saved while you sign in. Email/password and Google sign-in are available on your company's customer login page.</p>
            <button type="button" className="button primary full-width customer-auth-primary" style={{ background: store.tenant.loginPage?.primaryColor || undefined, borderColor: store.tenant.loginPage?.primaryColor || undefined, color: "#fff" }} onClick={continueToCustomerLogin}>Sign in to continue</button>
            <a className="text-link" href={`/login?returnTo=${encodeURIComponent(`/store/${slug}?checkout=1`)}`}>Open customer login page</a>
          </section> : <p className="payment-method-note">Add an item to your cart to continue to checkout.</p>}
          {orderError && <p className="inline-error">{orderError}</p>}
          {customerAccount && <button className="button primary full-width" type="submit" disabled={busy || cart.length === 0}>{busy ? "Placing order…" : `Place order · ${money(cartTotal)} · payment pending`}</button>}
        </form></> : <div className="empty-state">Choose an available product to continue.</div>}
      </section>
    </div>
    <section className="store-support-hub" id="support-hub">
      <header className="store-support-hub-heading"><div><p className="eyebrow">HERE WHEN YOU NEED US</p><h2>Support, made simple</h2></div><div className="store-support-tabs" role="tablist" aria-label="Support options"><button type="button" role="tab" aria-selected={supportTab === "order"} className={supportTab === "order" ? "active" : ""} onClick={() => setSupportTab("order")}>Order Support</button><button type="button" role="tab" aria-selected={supportTab === "platform"} className={supportTab === "platform" ? "active" : ""} onClick={() => setSupportTab("platform")}>Contact Super Admin</button></div></header>
      {supportTab === "platform" ? <StoreSupportChat slug={slug} /> : <section className="store-customer-support">
      <div className="store-support-heading"><div><h2><MessageCircle size={18} /> Order Support</h2><p>Continue your conversation with the store team.</p></div></div>
      {chat ? <div className="store-support-chat">
        <div className="store-support-order"><b>Order {chat.order.orderNumber} · {chat.conversation.orderIds?.length || 1} orders in this conversation</b><span>{chat.order.fulfillmentStatus.replaceAll("_", " ")} · {chat.conversation.status.replaceAll("_", " ")}</span></div>
        <div className="store-support-messages">{chat.conversation.messages.map((message) => <article className={`store-support-message ${message.sender === "customer" ? "from-customer" : "from-business"}`} key={message._id}><p>{message.body}</p><small>{message.senderName || (message.sender === "customer" ? chat.conversation.customerName : message.sender === "platform_admin" ? "Platform support" : store.tenant.name)}{message.orderId?.orderNumber ? ` · Order ${message.orderId.orderNumber}` : ""} · {chatDate(message.createdAt)}{message.sender === "customer" && (message.readByMerchantAt || message.readByAdminAt) ? " · Read" : ""}</small></article>)}</div>
        <form className="store-support-composer" onSubmit={sendChatMessage}><input aria-label="Support message" maxLength="2000" value={chatBody} onChange={(event) => setChatBody(event.target.value)} placeholder="Write a message about your order…" /><button className="button primary" disabled={chatBusy || !chatBody.trim()}><Send size={14} /> Send</button></form>
        {chatError && <p className="inline-error" role="alert">{chatError}</p>}
      </div> : <form className="store-order-verify" onSubmit={verifyOrder}>
        <p>Already placed an order? Enter the order number and the name and phone number used at checkout to securely open its support conversation.</p>
        <div><label>Order number<input required value={accessForm.orderNumber} onChange={(event) => setAccessForm({ ...accessForm, orderNumber: event.target.value })} /></label><label>Full name<input required minLength="2" value={accessForm.name} onChange={(event) => setAccessForm({ ...accessForm, name: event.target.value })} /></label><label>Phone number<input required value={accessForm.phone} onChange={(event) => setAccessForm({ ...accessForm, phone: event.target.value })} /></label><button className="button subtle" disabled={chatBusy}>{chatBusy ? "Verifying…" : "Open order support"}</button></div>
      </form>}
      {chatError && <p className="inline-error" role="alert">{chatError}</p>}
    </section>}</section>
    <footer className="storefront-footer">Store orders are saved by the business backend. Payment verification is not available until a provider is configured.</footer>
  </main>;
}
