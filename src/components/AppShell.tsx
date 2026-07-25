"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import WorkplaceSwitcher from "./WorkplaceSwitcher";
import {
  LayoutDashboard,
  ScanLine,
  ArrowDownToLine,
  PackageCheck,
  Truck,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  ClipboardCheck,
  LogOut,
  Mail,
  Settings,
  BookOpen,
} from "lucide-react";
import { AppShell as BaseAppShell, type NavGroup } from "@paloma-pf/ui";

// 業務カテゴリごとにグループ化したナビ（現場作業 / 在庫管理 / マスタ管理）
const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
      { href: "/scan", label: "スキャン", icon: ScanLine },
    ],
  },
  {
    title: "入荷業務",
    items: [
      { href: "/inbound", label: "入荷（受入）", icon: ArrowDownToLine },
      { href: "/putaway", label: "入庫（棚入れ）", icon: PackageCheck },
    ],
  },
  {
    title: "出荷業務",
    items: [{ href: "/issue-orders", label: "出庫", icon: Truck }],
  },
  {
    title: "在庫管理",
    items: [
      { href: "/stock", label: "在庫台帳", icon: Boxes },
      { href: "/records", label: "受払履歴", icon: ClipboardList },
      { href: "/move", label: "移動・調整", icon: ArrowLeftRight },
      { href: "/stocktakes", label: "棚卸", icon: ClipboardCheck },
    ],
  },
  {
    title: "マスタ管理",
    items: [{ href: "/settings", label: "マスタ設定", icon: Settings }],
  },
  {
    items: [{ href: "/guide", label: "使い方", icon: BookOpen }],
  },
];

/** 在庫アプリのテーマ（マゼンタ、アクティブは角丸＋丸バー）。 */
const ACCENT = "#d44fe6";

/**
 * 部署（工場）スコープの表示。ポータルの部署が工場のとき、一般・作業者は自工場のデータだけを見る。
 * 所属工場が工場マスタ（sites）に無い場合は「表示できるデータが無い」ことを伝える。
 * 所属工場は JWT に載せず都度サーバーで判定するため、職場セレクタと同じAPIから受け取る。
 */
function FactoryScopeNote() {
  const [scope, setScope] = useState<{ factory: string; matched: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/workplaces")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setScope(d.scope ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!scope) return null;
  return (
    <div className="mb-2 text-[10px] leading-snug text-slate-400">
      {scope.matched
        ? `${scope.factory}のデータのみ表示`
        : `${scope.factory}は工場マスタに未登録のため表示できるデータがありません`}
    </div>
  );
}

/** ログインユーザー表示とログアウト。next-auth 依存のためアプリ側に置く。 */
function UserFooter() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  const role = session.user.role;
  const isAdmin = role === "admin";
  return (
    <div className="mt-auto border-t border-slate-100 px-4 py-3">
      <div className="mb-2 truncate text-xs text-slate-500">
        {session.user.companyName}
        <span className="mx-1 text-slate-300">/</span>
        {session.user.name}
        <span
          style={isAdmin ? { color: ACCENT, backgroundColor: `${ACCENT}0D` } : undefined}
          className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${
            isAdmin ? "" : "bg-slate-100 text-slate-500"
          }`}
        >
          {isAdmin ? "管理者" : role === "worker" ? "作業者" : "一般"}
        </span>
      </div>
      <FactoryScopeNote />
      {/* ポータルのお問い合わせフォーム（このアプリを選択した状態で開く） */}
      <a
        href="https://portal.paloma-pf.com/?contact=zaiko"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <Mail className="h-4 w-4" />
        お問い合わせ
      </a>
      <button
        onClick={() => {
          void signOut({ redirect: false }).then(() => {
            window.location.href = "https://portal.paloma-pf.com/";
          });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </div>
  );
}

/**
 * 在庫アプリのシェル。共通の @paloma-pf/ui の AppShell に、
 * このアプリ固有のナビ（業務カテゴリ別）・テーマ・職場セレクタを差し込む。
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BaseAppShell
      nav={NAV_GROUPS}
      brand={{ eyebrow: "株式会社パロマ", title: "PF在庫管理" }}
      accent={ACCENT}
      navIndicator="pill"
      background="#f7f7f5"
      sidebarTop={<WorkplaceSwitcher />}
      headerRight={
        <div className="min-w-0 max-w-[55vw]">
          <WorkplaceSwitcher compact />
        </div>
      }
      sidebarFooter={<UserFooter />}
    >
      {children}
    </BaseAppShell>
  );
}
