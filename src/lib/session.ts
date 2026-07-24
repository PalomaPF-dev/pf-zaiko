import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./authOptions";
import { getCompanyEntitlement } from "./entitlement";
import { getUserRole, getUserRoleAndFactory, type UserRole } from "./authDb";

export interface AppSession {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  email: string;
  role: "admin" | "member" | "worker";
  /** 使い捨てデモ会社でログイン中か（デモ専用のUI出し分けに使う） */
  isDemo: boolean;
}

/**
 * ログイン中の会社ID・会社名・ユーザー名・役割を返す。
 * 未ログインなら /login にリダイレクト（Server Component / Server Action 用）。
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    redirect("/login");
  }
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role ?? "admin",
    isDemo: Boolean(session.user.isDemo),
  };
}

/**
 * ログイン＋利用権を要求（社内運用では ON_PREMISE 短絡により常に有効）。
 * 未ログイン・利用権なしは /login にリダイレクト。
 * データを描画/更新する Server Component・Server Action はこれを使う（利用権ゲートのサーバー側実施）。
 */
export async function requireEntitledSession(): Promise<AppSession> {
  const s = await requireSession();
  let active = true;
  try {
    active = (await getCompanyEntitlement(s.companyId)).active;
  } catch (e) {
    // 利用権チェックの一時失敗で利用を止めない（フェイルオープン）
    console.error("[entitlement] check failed, allowing:", e);
    return s;
  }
  if (!active) {
    redirect("/login");
  }
  return s;
}

/**
 * 管理者（role=admin）のみ許可。承認・差し戻し・ユーザー管理などの Server Action で使う。
 * 一般ユーザーはエラー（UI 側でもボタンを出さないが、サーバー側でも必ず防ぐ）。
 */
export async function requireAdminSession(): Promise<AppSession> {
  const s = await requireEntitledSession();
  if (s.role !== "admin") {
    throw new Error("この操作は管理者のみ実行できます");
  }
  return s;
}

/**
 * マスタ系ページ用: ログイン＋利用権に加えて管理者（role=admin）を要求。
 * 一般ユーザー（member）は "/" にリダイレクトして描画させない。
 * マスタ設定のサーバーコンポーネント（商品・ロケーション・取引先・拠点など）で使う。
 */
export async function requireAdminPage(): Promise<AppSession> {
  const s = await requireEntitledSession();
  if (s.role !== "admin") {
    redirect("/");
  }
  return s;
}

/**
 * 工場スコープ（データ表示制限）の判定。
 * - 管理者（role='admin'）と工場未設定（factory=NULL）ユーザー → null（全工場を閲覧可）
 * - それ以外（工場所属の一般・作業者） → 所属工場名（その工場＝sites 配下のデータのみ閲覧可）
 */
export function factoryScopeOf(role: UserRole | null, factory: string | null): string | null {
  return role === "admin" ? null : factory;
}

/** AppSession に所属工場（DB由来）と工場スコープを足したもの。 */
export interface ScopedSession extends AppSession {
  /** ポータルから連携された所属工場名（未設定なら null） */
  factory: string | null;
  /** 非 null のとき、その工場のデータだけを閲覧できる（null＝制限なし） */
  factoryScope: string | null;
}

/** セッション＋DBの役割・所属工場を1つにまとめる（role は DB を優先）。 */
async function withFactory(s: AppSession): Promise<ScopedSession> {
  const { role, factory } = await getUserRoleAndFactory(s.userId);
  const effectiveRole = role ?? s.role;
  return { ...s, role: effectiveRole, factory, factoryScope: factoryScopeOf(effectiveRole, factory) };
}

/**
 * ログイン＋利用権＋工場スコープを要求するセッション。
 * role/factory は DB から都度取得する（JWT には載せない＝ポータルでの変更が既存セッションにも即時反映される）。
 * 表示を絞る Server Component / Server Action はこれ（か scope.ts の currentSiteScope）を使う。
 */
export async function requireScopedSession(): Promise<ScopedSession> {
  return withFactory(await requireEntitledSession());
}

/** リダイレクトせず、未ログインなら null（API route / 内部のスコープ解決用）。 */
export async function getScopedSession(): Promise<ScopedSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  return withFactory({
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role ?? "admin",
    isDemo: Boolean(session.user.isDemo),
  });
}

/** リダイレクトせず、未ログインなら null を返す（任意表示用）。 */
export async function getOptionalSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  return session.user;
}

/**
 * ログイン中のセッション＋ユーザーの役割（role）を返す。未ログインなら null。
 * リダイレクトしないので、API route 側で 401/403 を返せる（メンバー管理などの管理系APIで使う）。
 * role は DB から都度取得する（既存セッションでも降格/昇格が即時反映される）。
 */
export async function getSessionWithRole(): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  const role = (await getUserRole(session.user.companyId, session.user.id)) ?? "admin";
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    email: session.user.email ?? "",
    role,
    isDemo: Boolean(session.user.isDemo),
  };
}
