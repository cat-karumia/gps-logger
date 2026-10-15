import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeloTelemetry - サイクリング衝撃・騒音ダッシュボード",
  description: "M5Stack 6-Axis IMU & Sound Sync Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
