"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, BarChart3, Bell, Boxes, BriefcaseBusiness, Building2, ChevronDown,
  CircleHelp, ClipboardList, CreditCard, ExternalLink, Grid2X2, LayoutDashboard, LogOut,
  MessageSquare, Package, Palette, Search, Settings, Shield, ShoppingBag, Store, Users, Wallet
} from "lucide-react";
import { api, clearToken } from "../lib/api";

const adminSections = [
  { title: "OVERVIEW", items: [{ label: "Platform Overview", href: "/super-admin/overview", icon: LayoutDashboard }, { label: "Analytics & Reports", href: "/super-admin/overview", icon: BarChart3 }] },
  { title: "BUSINESS MANAGEMENT", items: [{ label: "Create Business Account", href: "/super-admin/businesses", icon: Building2 }, { label: "Pending Approvals", href: "/super-admin/businesses?status=pending", icon: ClipboardList }, { label: "Business Activity", href: "/super-admin/audit", icon: Activity }] },
  { title: "USERS & ACCESS", items: [{ label: "User Management", href: "/super-admin/users", icon: Users }, { label: "Security Logs", href: "/super-admin/audit", icon: Shield }] },
  { title: "PLANS & BILLING", items: [{ label: "Platform Revenue", href: "/super-admin/settings", icon: Wallet }] },
  { title: "COMMERCE MONITORING", items: [{ label: "Payment Management", href: "/super-admin/payments", icon: Boxes }] },
  { title: "COMMUNICATION", items: [{ label: "Support Inbox", href: "/super-admin/support", icon: CircleHelp }, { label: "Store Customer Support", href: "/super-admin/customer-support", icon: MessageSquare }] },
  { title: "PLATFORM CONFIGURATION", items: [{ label: "Settings", href: "/super-admin/settings", icon: Settings }] }
];

const tenantSections = [
  { title: "STORE & OVERVIEW", items: [{ label: "Overview", href: "/dashboard", icon: Grid2X2 }, { label: "Sales Analytics", href: "/dashboard", icon: BarChart3 }] },
  { title: "CATALOG & STOCK", items: [{ label: "Products & Variants", href: "/dashboard/products", icon: Package }, { label: "Product Sections", href: "/dashboard/sections", icon: Boxes }] },
  { title: "COMMERCE OPERATIONS", items: [{ label: "Orders & Fulfillment", href: "/dashboard/orders", icon: ShoppingBag }, { label: "Payment Activity", href: "/dashboard/payments", icon: CreditCard }] },
  { title: "COMMUNICATIONS", items: [{ label: "Order Chat", href: "/dashboard/order-chat", icon: MessageSquare }, { label: "Customer Support / Chat", href: "/dashboard/chat", icon: CircleHelp }] },
  { title: "STOREFRONT", items: [{ label: "Storefront Management", href: "/dashboard/settings", icon: BriefcaseBusiness }, { label: "Public Storefront Link", href: "/dashboard/settings", icon: ExternalLink }, { label: "Share Storefront", href: "/dashboard/settings#storefront-share", icon: Store }, { label: "Customize Login Page", href: "/dashboard/login-page", icon: Palette }] },
  { title: "PAYMENTS", items: [{ label: "Payment Gateway Settings", href: "/dashboard/payment-gateway-settings", icon: CreditCard }] }
];

export function AppShell({ role, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [checking, setChecking] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [queryString, setQueryString] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const sections = role === "super_admin" ? adminSections : tenantSections.map((section) => ({
    ...section,
    items: section.items.map((item) => item.label === "Public Storefront Link" && tenant?.slug
      ? { ...item, href: `/store/${encodeURIComponent(tenant.slug)}` }
      : item)
  }));
  const expectedRole = role === "tenant" ? "business_owner" : role;

  useEffect(() => {
    setQueryString(window.location.search);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then((result) => {
        if (!active) return;
        if (result.user.role !== expectedRole) {
          router.replace(result.user.role === "super_admin" ? "/super-admin/overview" : "/dashboard");
          return;
        }
        setUser(result.user);
        setTenant(result.tenant);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason.message);
        if (reason.status === 401 || reason.status === 403) {
          clearToken();
          router.replace("/login");
        }
      })
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [expectedRole, role, router]);

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  function submitGlobalSearch(event) {
    if (event.key !== "Enter" || !globalSearch.trim()) return;
    const target = role === "super_admin" ? "/super-admin/businesses" : "/dashboard/orders";
    router.push(`${target}?search=${encodeURIComponent(globalSearch.trim())}`);
  }

  if (checking) return <div className="screen-message">Checking your secure session…</div>;
  if (!user) return <div className="screen-message"><p>{error}</p><a className="button primary" href="/login">Sign in</a></div>;

  const title = sections.flatMap((section) => section.items).find((item) => item.href === pathname)?.label || (role === "super_admin" ? "Platform Overview" : "Store Overview");
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Image src="/vendora-mark.png" alt="" width={36} height={36} /></div>
          <div className="brand-copy"><b>Vendora</b><small>{role === "super_admin" ? "SUPER ADMIN" : tenant?.name || "STORE OPERATIONS"}</small></div>
          <button className="icon-button collapse-button" aria-label="Collapse navigation" onClick={() => setCollapsed(!collapsed)}><ChevronDown size={16} /></button>
        </div>
        <div className="workspace-label">{role === "super_admin" ? "PLATFORM WORKSPACE" : "LIVE STOREFRONT"}</div>
        <nav className="side-nav">
          {sections.map((section) => <div className="nav-section" key={section.title}>
            <p className="nav-heading">{section.title}</p>
            {section.items.map(({ label, href, icon: Icon }) => {
              const isPendingView = queryString.includes("status=pending");
              const isActive = label === "Pending Approvals"
                ? pathname === "/super-admin/businesses" && isPendingView
                : pathname === href && !(label === "Create Business Account" && isPendingView);
              return <a className={`nav-item ${isActive ? "active" : ""}`} href={href} key={label} title={label} target={label === "Public Storefront Link" ? "_blank" : undefined} rel={label === "Public Storefront Link" ? "noreferrer" : undefined}>
                <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
              </a>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini"><span className="avatar">{user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><b>{user.name}</b><small>{role === "super_admin" ? "Platform Admin" : "Store Owner & Merchant"}</small></div><button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={15} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">{role === "super_admin" ? "Vendora" : tenant?.name || "Vendora"} <span>/</span> <b>{title}</b></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={15} /><input aria-label="Global search" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={submitGlobalSearch} placeholder={role === "super_admin" ? "Search businesses…" : "Search orders, SKU, customer"} /><kbd>Enter</kbd></label>
            {role === "tenant" && <a className="button subtle compact" href={`/store/${tenant?.slug || "aura-atelier"}`} target="_blank" rel="noreferrer">View Live Store</a>}
            <NotificationCenter role={role} />
            <button className="avatar top-avatar" aria-label="User menu">{user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function NotificationCenter({ role }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [support, orders] = role === "super_admin"
          ? await Promise.all([
            api("/admin/support/conversations?page=1&limit=100"),
            api("/admin/order-conversations")
          ])
          : await Promise.all([
            api("/tenant/support/conversations?page=1&limit=100"),
            api("/tenant/conversations")
          ]);
        if (!active) return;
        const supportNotifications = support.items
          .filter((item) => role === "super_admin" ? item.unreadByAdmin : item.unreadByBusiness)
          .map((item) => ({
            id: `support:${item._id}`,
            name: item.customerName || item.createdBy?.name || item.tenantId?.name || "Business support",
            preview: item.lastMessage,
            href: role === "super_admin"
              ? `/super-admin/support?conversationId=${encodeURIComponent(item._id)}`
              : `/dashboard/support?conversationId=${encodeURIComponent(item._id)}`,
            timestamp: item.lastMessageAt
          }));
        const orderNotifications = orders.items
          .filter((item) => role === "super_admin" ? item.unreadByAdmin : item.unreadByMerchant)
          .map((item) => ({
            id: `order:${item._id}`,
            name: item.customerName || item.orderId?.customerName || item.orderId?.customer?.name || "Store customer",
            preview: item.messages?.at(-1)?.body || `New message about order ${item.orderId?.orderNumber || ""}`,
            href: role === "super_admin"
              ? `/super-admin/customer-support?orderId=${encodeURIComponent(item.orderId?._id || "")}`
              : `/dashboard/order-chat?orderId=${encodeURIComponent(item.orderId?._id || "")}`,
            timestamp: item.updatedAt
          }));
        setNotifications([...supportNotifications, ...orderNotifications]
          .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp)));
        setError("");
      } catch (reason) {
        if (active) setError(reason.message);
      }
    };

    if (role === "super_admin") {
      refresh();
      const timer = window.setInterval(refresh, 4000);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }

    return () => { active = false; };
  }, [role]);

  const unreadCount = notifications.length;
  return <div className="notification-wrap">
    <button
      className="icon-button notification-button"
      type="button"
      aria-label={unreadCount ? `${unreadCount} unread support messages` : "Notifications"}
      aria-expanded={open}
      title={unreadCount ? `${unreadCount} unread support messages` : "Notifications"}
      onClick={() => setOpen((current) => !current)}
    >
      <Bell size={17} />
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <div className="notification-popover">
      <div className="notification-popover-heading"><b>Notifications</b>{unreadCount > 0 && <span>{unreadCount} new</span>}</div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      {notifications.length ? notifications.slice(0, 8).map((notification) => <button
        className="notification-entry"
        type="button"
        key={notification.id}
        onClick={() => {
          setOpen(false);
          router.push(notification.href);
        }}
      >
        <span className="notification-entry-icon"><MessageSquare size={15} /></span>
        <span><b>{notification.name}</b><small>{notification.preview}</small></span>
        <i />
      </button>) : !error && <p className="notification-empty">You’re all caught up.</p>}
      {unreadCount > 8 && <a className="notification-view-all" href="/super-admin/support" onClick={() => setOpen(false)}>View all support messages</a>}
      {role !== "super_admin" && <a className="notification-view-all" href="/dashboard/support" onClick={() => setOpen(false)}>View support inbox</a>}
    </div>}
  </div>;
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</div>;
}

export function MetricCard({ label, value, note, icon: Icon, tone = "blue" }) {
  return <section className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><p>{label}</p><strong>{value}</strong><small>{note}</small></section>;
}

export function StatusPill({ children, tone = "neutral" }) {
  return <span className={`status-pill ${tone}`}><i />{children}</span>;
}

export function Panel({ title, action, children, className = "" }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}

export function LoadingState({ error, retry }) {
  return <div className="state-box">{error ? <><b>We couldn’t load this data</b><p>{error}</p>{retry && <button className="button subtle" onClick={retry}>Try again</button>}</> : <span className="spinner" aria-label="Loading" />}</div>;
}
