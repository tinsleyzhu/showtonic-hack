import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Showtonic",
    description: "Discover shows, keep a live music diary, and share the moments that made the night.",
    openGraph: {
      title: "Showtonic",
      description: "Your live music diary",
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Showtonic live music diary" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Showtonic",
      description: "Your live music diary",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
