import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";

/**
 * 本文フォント。OS標準任せだと Mac=ヒラギノ / Windows=メイリオ で見え方が変わるため、
 * PFシリーズ共通のフォントを配信して両OSで同じ表示にする（ポータルと同じ Noto Sans JP）。
 * next/font はビルド時にフォントを取り込んで自前配信するので、実行時の外部リクエストは無い。
 */
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "PF在庫管理",
  description: "製造現場向け 在庫管理システム（QRラベル入出庫・受払履歴・棚卸・在庫アラート）",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PF在庫管理", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
