import type { Metadata } from "next";
import "./globals.css";

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
