import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "../styles/editorial.css";

export const metadata: Metadata = {
  title: "YIIYA — Voice-First 3D Asset Studio",
  description:
    "An experimental 3D creation studio with voice, text and reference images. Review generated meshes and export GLB, OBJ or STL when available.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "YIIYA",
    description: "Voice-first 3D asset generation. Say something, get a 3D model.",
    url: "https://yiiya.vercel.app",
    siteName: "YIIYA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YIIYA — Voice-First 3D Asset Studio",
    description: "Say something. Get a 3D asset.",
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
