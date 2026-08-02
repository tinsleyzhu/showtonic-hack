import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showtonic Hack",
  description: "Log live show memories, build festival recaps, and find your taste twins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
