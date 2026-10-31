import { AppShell } from "../../components/AppShell";

export default function TenantLayout({ children }) {
  return <AppShell role="tenant">{children}</AppShell>;
}
