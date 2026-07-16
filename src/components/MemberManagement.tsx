"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, Loader2, Copy, Check, KeyRound } from "lucide-react";

type Member = {
  id: string;
  loginId: string | null;
  email: string | null;
  name: string;
  role: "admin" | "member";
  pending: boolean;
  createdAt: string;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * メンバー管理（管理者限定）。
 * 一覧の取得・アカウント発行（社員番号＋氏名。メールは任意）・設定リンク再発行・削除を行う。
 * 権限チェックは API 側で担保。
 * メールが飛ばない社内環境向けに、発行/再発行時はパスワード設定リンクをその場で表示・コピーできる。
 */
export default function MemberManagement({ myUserId }: { myUserId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState("");

  // 発行フォーム
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState("");

  // 設定リンク表示（発行・再発行の両方で使う）
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deletingId, setDeletingId] = useState("");
  const [reissuingId, setReissuingId] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/members");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.members as Member[]);
    } catch {
      setLoadError("メンバー一覧の取得に失敗しました。画面を更新してください。");
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setLinkUrl("");
    setCopied(false);
    setInviting(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, name, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || "発行に失敗しました。");
        setInviting(false);
        return;
      }
      setLinkUrl(data.inviteUrl || "");
      setLinkName(name);
      setLinkEmailSent(Boolean(data.emailSent));
      setLoginId("");
      setName("");
      setEmail("");
      setRole("member");
      await load();
    } catch {
      setFormError("通信エラーが発生しました。");
    } finally {
      setInviting(false);
    }
  }

  /** パスワード設定リンクの再発行（古いリンクは無効になる）。 */
  async function onReissue(m: Member) {
    if (reissuingId) return;
    setReissuingId(m.id);
    setCopied(false);
    try {
      const res = await fetch(`/api/members/${m.id}/reset-link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "再発行に失敗しました。");
        return;
      }
      setLinkUrl(data.resetUrl || "");
      setLinkName(m.name);
      setLinkEmailSent(Boolean(data.emailSent));
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setReissuingId("");
    }
  }

  async function onDelete(m: Member) {
    if (deletingId) return;
    if (!confirm(`「${m.name}」さんのアカウントを削除しますか？この操作は元に戻せません。`)) return;
    setDeletingId(m.id);
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "削除に失敗しました。");
        setDeletingId("");
        return;
      }
      await load();
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setDeletingId("");
    }
  }

  async function copyLinkUrl() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード不可の環境では手動選択でコピーしてもらう */
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
        <Users className="h-4 w-4 text-fuchsia-600" />
        メンバー（アカウント管理）
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        社員のアカウントを社員番号で発行・削除します。発行時に表示される「設定リンク」を本人に伝え、
        パスワードを設定するとログインできます（メールアドレスを登録した場合はメールでも届きます）。
      </p>

      {/* 一覧 */}
      {members === null ? (
        <div className="mb-4 flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : loadError ? (
        <p className="mb-4 rounded-xl border border-dashed border-red-200 bg-red-50 py-4 text-center text-sm text-red-600">
          {loadError}
        </p>
      ) : members.length === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
          メンバーはまだいません。
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{m.name}</span>
                  {m.role === "admin" ? (
                    <span className="shrink-0 rounded bg-fuchsia-50 px-1.5 py-0.5 text-xs font-medium text-fuchsia-700">
                      管理者
                    </span>
                  ) : (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      一般
                    </span>
                  )}
                  {m.pending ? (
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      パスワード未設定
                    </span>
                  ) : (
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                      有効
                    </span>
                  )}
                  {m.id === myUserId && (
                    <span className="shrink-0 text-xs text-slate-400">（あなた）</span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">
                  社員番号: {m.loginId ?? "未設定"}
                  {m.email ? ` ／ ${m.email}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onReissue(m)}
                disabled={reissuingId === m.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 hover:border-fuchsia-300 hover:text-fuchsia-700 disabled:opacity-40"
                title="パスワード設定リンクを再発行します（古いリンクは無効になります）"
              >
                {reissuingId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                設定リンク再発行
              </button>
              {m.id !== myUserId && (
                <button
                  type="button"
                  onClick={() => onDelete(m)}
                  disabled={deletingId === m.id}
                  className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  aria-label="削除"
                >
                  {deletingId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 発行・再発行した設定リンク（メール未登録・メール未達環境向けに常に表示） */}
      {linkUrl && (
        <div className="mb-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
          <p className="text-sm font-medium text-fuchsia-800">
            {linkName
              ? `「${linkName}」さんのパスワード設定リンクを発行しました。`
              : "パスワード設定リンクを発行しました。"}
          </p>
          <p className="mt-1 text-xs text-fuchsia-700">
            {linkEmailSent
              ? "設定リンクをメールでも送信しました。届かない場合は、下のリンクを本人にお伝えください（7日以内に開いてパスワードを設定してもらいます）。"
              : "下のリンクを本人にお伝えください（7日以内に開いてパスワードを設定してもらいます）。"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={linkUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-fuchsia-300 bg-white px-3 py-2 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={copyLinkUrl}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-fuchsia-300 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        </div>
      )}

      {/* 発行フォーム */}
      <form onSubmit={onInvite} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <UserPlus className="h-4 w-4 text-fuchsia-600" />
          新しいメンバーを追加
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">社員番号</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              pattern="[A-Za-z0-9_-]+"
              title="半角英数字とハイフン・アンダースコアで入力してください"
              placeholder="例: 12345"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">お名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="山田 太郎"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              メールアドレス（任意）
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com（設定リンクをメールでも送る場合）"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">役割</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className={inputCls}
            >
              <option value="member">一般（入出庫・棚卸・閲覧ができます）</option>
              <option value="admin">管理者（メンバーの追加・削除もできます）</option>
            </select>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={inviting}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#d44fe6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ae41bd] disabled:opacity-60"
          >
            {inviting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                追加中…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                この内容でアカウントを発行
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
