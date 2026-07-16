"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import WebOnly from "@/components/WebOnly";

/**
 * 初期セットアップ（初回だけの「管理者アカウント作成」）フォーム。
 * 会社名・お名前・メール・パスワードを登録し、そのままログインする。
 * 以後のアカウントは管理者がメンバー管理から発行する（自己登録は不可）。
 */
export default function InitialSetupForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, userName, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "登録に失敗しました。");
        setLoading(false);
        return;
      }
      // 登録後そのままログイン
      const login = await signIn("credentials", { email, password, redirect: false });
      setLoading(false);
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
      setLoading(false);
    }
  }

  return (
    <WebOnly
      fallback={
        <div className="text-center text-sm text-slate-600">
          <p>初期セットアップはWeb版（ブラウザ）からお願いします。</p>
          <p className="mt-3">
            既にアカウントをお持ちの方は{" "}
            <Link href="/login" className="font-medium text-[#d44fe6] hover:underline">ログイン</Link>
          </p>
        </div>
      }
    >
      <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        最初にこの管理者アカウントを1つだけ作成します。作成後は、この管理者が「マスタ設定」画面から
        社員のアカウントを発行します（この画面からの新規作成は今回かぎりです）。
        <br />
        <span className="font-semibold">管理者ID: admin（全アプリ共通）</span>
        — ログインは社員番号「admin」とパスワードで行います。
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="会社名 / 事業所名" value={companyName} onChange={setCompanyName} placeholder="株式会社○○製作所" />
        <Field label="お名前（管理者）" value={userName} onChange={setUserName} placeholder="山田 太郎" />
        <Field label="メールアドレス" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
        <Field label="パスワード（8文字以上）" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#d44fe6] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ae41bd] disabled:opacity-60"
        >
          {loading ? "作成中…" : "管理者アカウントを作成"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        既にアカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-[#d44fe6] hover:underline">
          ログイン
        </Link>
      </p>
    </WebOnly>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm focus:border-[#d44fe6] focus:outline-none focus:ring-1 focus:ring-[#d44fe6]"
      />
    </div>
  );
}
