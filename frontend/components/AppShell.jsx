"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Archive, BarChart3, Bell, Boxes, BriefcaseBusiness, Building2, ChevronDown,
  CircleHelp, ClipboardList, CreditCard, Grid2X2, LayoutDashboard, LogOut, MessageSquare,
  Package, Search, Settings, Shield, ShoppingBag, Users, Wallet
} from "lucide-react";
import { api, clearToken } from "../lib/api";

const adminSections = [
  { title: "OVERVIEW", items: [{ label: "Platform Overview", href: "/super-admin/overview", icon: LayoutDashboard }, { label: "Analytics & Reports", href: "/super-admin/overview", icon: BarChart3 }] },
  { title: "BUSINESS MANAGEMENT", items: [{ label: "Create Business Account", href: "/super-admin/businesses", icon: Building2 }, { label: "Pending Approvals", href: "/super-admin/businesses?status=pending", icon: ClipboardList }, { label: "Business Activity", href: "/super-admin/audit", icon: Activity }] },
  { title: "USERS & ACCESS", items: [{ label: "User Management", href: "/super-admin/users", icon: Users }, { label: "Security Logs", href: "/super-admin/audit", icon: Shield }] },
  { title: "PLANS & BILLING", items: [{ label: "Platform Revenue", href: "/super-admin/settings", icon: Wallet }] },
  { title: "COMMERCE MONITORING", items: [{ label: "Payment Management", href: "/super-admin/payments", icon: Boxes }] },
  { title: "COMMUNICATION", items: [{ label: "Support Inbox", href: "/super-admin/support", icon: CircleHelp }] },
  { title: "PLATFORM CONFIGURATION", items: [{ label: "Settings", href: "/super-admin/settings", icon: Settings }] }
];

const tenantSections = [
  { title: "STORE & OVERVIEW", items: [{ label: "Overview", href: "/dashboard", icon: Grid2X2 }, { label: "Sales Analytics", href: "/dashboard", icon: BarChart3 }] },
  { title: "CATALOG & STOCK", items: [{ label: "Products & Variants", href: "/dashboard/products", icon: Package }, { label: "Inventory Matrix", href: "/dashboard/products", icon: Boxes }, { label: "Collections", href: "/dashboard/products", icon: Archive }] },
  { title: "COMMERCE OPERATIONS", items: [{ label: "Orders & Fulfillment", href: "/dashboard/orders", icon: ShoppingBag }, { label: "Customers Directory", href: "/dashboard/orders", icon: Users }] },
  { title: "COMMUNICATIONS", items: [{ label: "Order Chat", href: "/dashboard/order-chat", icon: MessageSquare }, { label: "Customer Support / Chat", href: "/dashboard/chat", icon: CircleHelp }] },
  { title: "STOREFRONT & SETTINGS", items: [{ label: "Public Storefront", href: "/dashboard/settings", icon: BriefcaseBusiness }, { label: "Payment Gateway", href: "/dashboard/payments", icon: CreditCard }, { label: "Store Settings", href: "/dashboard/settings", icon: Settings }] }
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
  const sections = role === "super_admin" ? adminSections : tenantSections;
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
          <div className="brand-mark">A</div>
          <div className="brand-copy"><b>{role === "super_admin" ? "NexusControl" : tenant?.name || "Aura Atelier"}</b><small>{role === "super_admin" ? "SUPER ADMIN" : tenant?.category || "STORE OPERATIONS"}</small></div>
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
              return <a className={`nav-item ${isActive ? "active" : ""}`} href={href} key={label} title={label}>
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
          <div className="breadcrumbs">{role === "super_admin" ? "NexusControl" : tenant?.name || "Aura Atelier"} <span>/</span> <b>{title}</b></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={15} /><input aria-label="Global search" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={submitGlobalSearch} placeholder={role === "super_admin" ? "Search businesses…" : "Search orders, SKU, customer"} /><kbd>Enter</kbd></label>
            {role === "tenant" && <a className="button subtle compact" href={`/store/${tenant?.slug || "aura-atelier"}`} target="_blank" rel="noreferrer">View Live Store</a>}
            <button className="icon-button notification-button" aria-label="Notifications not configured" title="Notifications are not configured" disabled><Bell size={17} /></button>
            <button className="avatar top-avatar" aria-label="User menu">{user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
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
