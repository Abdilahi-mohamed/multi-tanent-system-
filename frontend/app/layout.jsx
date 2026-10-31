import "./globals.css";

export const metadata = {
  title: "Aura Commerce",
  description: "Multi-tenant commerce management platform"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
