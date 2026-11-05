import "./globals.css";

export const metadata = {
  title: "Vendora",
  description: "Global multi-vendor commerce platform"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
