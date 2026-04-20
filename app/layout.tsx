import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "../styles/editorial.css";

export const metadata: Metadata = {
  title: "Yiiya",
  description: "A voice-first creation tool for websites and 3D scenes."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
