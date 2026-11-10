"use client";

import { useEffect } from "react";

export default function CustomerLoginPage() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (!query.has("returnTo")) query.set("returnTo", "/customer/orders");
    window.location.replace(`/login?${query.toString()}`);
  }, []);

  return <main className="login-page"><p className="screen-message">Opening shared sign in…</p></main>;
}