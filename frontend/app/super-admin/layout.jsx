import { AppShell } from "../../components/AppShell";

export default function SuperAdminLayout({ children }) {
  return <AppShell role="super_admin">{children}</AppShell>;
}
