import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";

/** ユーザーの役割。admin=管理者（承認・ユーザー管理が可能）、member=一般（検査・閲覧） */
export type UserRole = "admin" | "member";

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理者",
  member: "一般",
};

/** 認証用テーブル（companies/users）を冪等に作成。空DBでも自動初期化されるようにする。 */
export async function ensureAuthSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id)`;
  // 役割。既定は member（管理者は初期セットアップ /register または招待で明示的に付与）。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT`;
  await sql`UPDATE users SET role = 'member' WHERE role IS NULL`;
  // 一度きり：社内化前に既存ユーザーを誤って管理者へ一括昇格していたのを是正（全員 member に戻す）。
  // 管理者は各アプリの初期セットアップ(/register)で作成する。pf_migrations で二度は実行しない。
  await sql`CREATE TABLE IF NOT EXISTS pf_migrations (key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  {
    const applied = await sql`SELECT 1 FROM pf_migrations WHERE key = 'reset_roles_member_v1' LIMIT 1`;
    if (applied.length === 0) {
      await sql`UPDATE users SET role = 'member'`;
      await sql`INSERT INTO pf_migrations (key) VALUES ('reset_roles_member_v1')`;
    }
  }
  // 招待（アカウント発行）モデル用。pending=true は招待メール送信済み・パスワード未設定。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false`;
  // 社員番号ログイン（login_id）への移行。email は任意（社内は未登録の社員が多い）。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_idx ON users(login_id)`;
  // バックフィル（冪等）: ①既存管理者の最初の1人に 'admin' を割り当て（既に 'admin' が居れば何もしない）
  await sql`
    UPDATE users SET login_id = 'admin'
    WHERE login_id IS NULL
      AND id = (
        SELECT id FROM users
        WHERE role = 'admin' AND login_id IS NULL
        ORDER BY created_at ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE login_id = 'admin')`;
  // ②残りは従来のメールアドレスを社員番号として引き継ぐ（メールでのログイン互換）
  await sql`UPDATE users SET login_id = email WHERE login_id IS NULL`;
  // email は NULL 許可へ（社員番号だけでアカウント発行できるようにする）
  await sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`;
  // 統一管理者（login_id='admin'）のブートストラップ
  await ensureAdminBootstrap();
}

/** 実運用の会社名（統一管理者の所属先）。 */
const BOOTSTRAP_COMPANY_NAME = "株式会社パロマ";

/**
 * 実運用の会社「株式会社パロマ」を名前で get-or-create して id を返す。
 * 既存があれば必ず再利用する（同名が複数あっても最古の1社に寄せる）。
 */
async function getOrCreateBootstrapCompany(sql: ReturnType<typeof getSql>): Promise<string> {
  const companies = await sql`
    SELECT id FROM companies WHERE name = ${BOOTSTRAP_COMPANY_NAME}
    ORDER BY created_at ASC LIMIT 1`;
  const existing = companies[0]?.id as string | undefined;
  if (existing) return existing;
  const created = await sql`
    INSERT INTO companies (name) VALUES (${BOOTSTRAP_COMPANY_NAME}) RETURNING id`;
  return created[0].id as string;
}

/**
 * 統一管理者ブートストラップ（冪等）。
 * login_id='admin' のユーザーが居ない場合のみ、環境変数 PF_ADMIN_BOOTSTRAP_HASH
 * （bcrypt ハッシュ）が設定されていれば「株式会社パロマ」（無ければ作成）＋
 * 管理者ユーザー（login_id='admin'）を作成する。env が無ければ何もしない。
 */
async function ensureAdminBootstrap(): Promise<void> {
  const hash = (process.env.PF_ADMIN_BOOTSTRAP_HASH ?? "").trim();
  if (!hash) return;
  const sql = getSql();
  const admin = await sql`SELECT 1 FROM users WHERE login_id = 'admin' LIMIT 1`;
  if (admin.length > 0) return;
  const companyId = await getOrCreateBootstrapCompany(sql);
  // email 重複などの競合時は何もしない（冪等・安全側）
  await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending)
    VALUES (${companyId}, 'admin', ${null}, ${"管理者"}, ${hash}, 'admin', false)
    ON CONFLICT DO NOTHING`;
}

/** 社員番号（login_id）重複チェック */
export async function loginIdExists(loginId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE login_id = ${loginId} LIMIT 1`;
  return rows.length > 0;
}

/** メール重複チェック */
export async function emailExists(email: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
  return rows.length > 0;
}

/** 会社を作成し ID を返す */
export async function createCompany(name: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`INSERT INTO companies (name) VALUES (${name}) RETURNING id`;
  return rows[0].id as string;
}

/**
 * 会社名で会社を取得し、無ければ作成して ID を返す（get-or-create）。
 * 統一管理者ブートストラップと同じ方法（最古の同名会社を採用）。ポータル一括発行(provision)用。
 */
export async function getOrCreateCompanyByName(name: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM companies WHERE name = ${name}
    ORDER BY created_at ASC LIMIT 1`;
  const existing = rows[0]?.id as string | undefined;
  if (existing) return existing;
  const created = await sql`INSERT INTO companies (name) VALUES (${name}) RETURNING id`;
  return created[0].id as string;
}

/** ユーザーを作成（パスワードは bcrypt でハッシュ化）。新規登録の初期ユーザーは admin。 */
export async function createUser(
  companyId: string,
  email: string,
  name: string,
  password: string,
  role: UserRole = "admin",
  loginId: string | null = null
): Promise<void> {
  const sql = getSql();
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (company_id, email, name, password_hash, role, login_id)
    VALUES (${companyId}, ${email}, ${name}, ${passwordHash}, ${role}, ${loginId})
  `;
}

/**
 * 招待ユーザーを作成（pending=true）。ログインできないランダムなハッシュを設定し、
 * パスワードは招待リンク（/password-reset/confirm）から本人が設定する。作成したIDを返す。
 */
export async function createInvitedUser(
  companyId: string,
  loginId: string,
  name: string,
  role: UserRole,
  email: string | null = null
): Promise<string> {
  const sql = getSql();
  // ランダムな使えないパスワード（招待完了までログイン不可）
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
  const rows = await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending)
    VALUES (${companyId}, ${loginId}, ${email}, ${name}, ${passwordHash}, ${role}, true)
    RETURNING id`;
  return rows[0].id as string;
}

// ===== ユーザー管理（管理者用） =====

export interface CompanyUser {
  id: string;
  loginId: string | null;
  email: string | null;
  name: string;
  role: UserRole;
  pending: boolean;
  createdAt: string;
}

export async function listUsers(companyId: string): Promise<CompanyUser[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, login_id, email, name, role, pending, created_at FROM users
    WHERE company_id = ${companyId} ORDER BY created_at ASC`;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return rows.map((r: any) => ({
    id: r.id,
    loginId: (r.login_id ?? null) as string | null,
    email: (r.email ?? null) as string | null,
    name: r.name,
    role: (r.role ?? "admin") as UserRole,
    pending: Boolean(r.pending),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/** 全社横断の管理者数（初期セットアップ判定に使う。まだ会社が無い＝0）。 */
export async function countAllAdmins(): Promise<number> {
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`;
  return Number(rows[0].c);
}

/** 会社内の特定ユーザーの役割を返す（存在しなければ null）。 */
export async function getUserRole(companyId: string, userId: string): Promise<UserRole | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT role FROM users WHERE company_id = ${companyId} AND id = ${userId} LIMIT 1`;
  if (!rows[0]) return null;
  return ((rows[0] as { role: string | null }).role ?? "admin") as UserRole;
}

/** 会社内の管理者数（最後の管理者を消さないためのチェックに使う）。 */
export async function countAdmins(companyId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*) AS c FROM users WHERE company_id = ${companyId} AND role = 'admin'`;
  return Number(rows[0].c);
}

export async function updateUserRole(
  companyId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users SET role = ${role}
    WHERE company_id = ${companyId} AND id = ${userId}`;
}

export async function deleteUser(companyId: string, userId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM users WHERE company_id = ${companyId} AND id = ${userId}`;
}
