import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "StormCast — Transforme conversas em cortes",
    template: "%s | StormCast",
  },
  description:
    "Encontre, organize e prepare os melhores momentos de podcasts, vídeos e transmissões em um estúdio protegido.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  metadataBase: new URL("https://stormcast.site"),
  openGraph: {
    title: "StormCast — Transforme conversas em cortes",
    description: "Um fluxo simples para encontrar, enquadrar e preparar cortes de vídeos longos.",
    type: "website",
    locale: "pt_BR",
    siteName: "StormCast",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
