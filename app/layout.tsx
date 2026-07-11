import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "../styles/editorial.css";

export const metadata: Metadata = {
  title: "Yiiya",
  description:
    "A voice-first studio for fast CAD-ready 3D assets, scans, and animation handoff.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
