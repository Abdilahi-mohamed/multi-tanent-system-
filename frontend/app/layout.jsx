import "./globals.css";

export const metadata = {
  title: "Vendora — Global Multi-Vendor SaaS Platform",
  description: "Vendora — Global Multi-Vendor SaaS Platform",
  applicationName: "Vendora"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
