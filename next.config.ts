import type { NextConfig } from "next";

// 通常の SSR ビルド（Vercel）。iOS は将来 Capacitor のリモート読込でこのライブサイトを表示する。
const nextConfig: NextConfig = {
  // 共通UIパッケージは TSX をそのまま配布しているためトランスパイルする
  transpilePackages: ["@paloma-pf/ui"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
