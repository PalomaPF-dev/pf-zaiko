import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

// localhost のクッキーはポートを跨いで共有されるため、既定名（next-auth.session-token）のままだと
// 他のPFアプリの開発サーバーと相互上書きになり JWEDecryptionFailed が起きる。
// アプリ固有のクッキー名にして分離する（本番でも無害）。
// Vercel 上は NEXTAUTH_URL 未設定（VERCEL_URL フォールバック）でも必ず HTTPS。
const useSecureCookies =
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";
const securePrefix = useSecureCookies ? "__Secure-" : "";

/**
 * next-auth 設定（PF家族共通：メール＋パスワード／Neon の users・companies）。
 * セッションは JWT。companyId 単位でデータをスコープする。
 */
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: `${securePrefix}inventory.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${securePrefix}inventory.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      // CSRF トークンの既定名は __Host- プレフィックス。他アプリとの衝突回避で名前だけ変える。
      name: `${useSecureCookies ? "__Host-" : ""}inventory.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        // フィールド名は互換のため email のまま（値は社員番号 login_id。旧メールも受け付ける）
        email: { label: "社員番号", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const sql = getSql();
        // login_id 列・統一管理者ブートストラップなどを冪等に整えてからログイン処理する
        // （初回アクセスや env 追加直後でもログインできるように）。失敗しても続行。
        try {
          await ensureAuthSchema();
        } catch {
          /* スキーマ初期化の一時失敗ではログイン自体は止めない */
        }
        const loginId = credentials.email.trim();
        let rows;
        try {
          // 社員番号（login_id）を優先して検索し、無ければ従来のメールアドレスでも検索（移行互換）
          rows = await sql`
            SELECT u.id, u.login_id, u.email, u.name, u.password_hash, u.role, u.pending,
                   c.id AS company_id, c.name AS company_name, c.is_demo
            FROM users u
            JOIN companies c ON c.id = u.company_id
            WHERE u.login_id = ${loginId}
            LIMIT 1
          `;
          if (rows.length === 0) {
            rows = await sql`
              SELECT u.id, u.login_id, u.email, u.name, u.password_hash, u.role, u.pending,
                     c.id AS company_id, c.name AS company_name, c.is_demo
              FROM users u
              JOIN companies c ON c.id = u.company_id
              WHERE u.email = ${loginId.toLowerCase()}
              LIMIT 1
            `;
          }
        } catch {
          // 新規DBで users/companies が未作成の場合などはログイン失敗扱い（登録時に自動作成される）
          return null;
        }
        const user = rows[0];
        if (!user) return null;
        // 招待発行済み・パスワード未設定（pending）はログイン不可。メッセージは signIn の error で表示される。
        if (user.pending) {
          throw new Error(
            "初回ログインのため、パスワードの設定が必要です。ログイン画面の「初めてログインする方はこちら」からパスワードを設定してください。"
          );
        }
        const valid = await bcrypt.compare(credentials.password, user.password_hash as string);
        if (!valid) return null;
        return {
          id: user.id as string,
          email: (user.email ?? null) as string | null,
          name: user.name as string,
          companyId: user.company_id as string,
          companyName: user.company_name as string,
          // 役割導入前のユーザー（role 未設定）は管理者として扱う
          role: (user.role ?? "admin") as "admin" | "member",
          isDemo: Boolean(user.is_demo),
        };
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.role = user.role;
        token.isDemo = user.isDemo;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.role = (token.role ?? "admin") as "admin" | "member";
        session.user.isDemo = Boolean(token.isDemo);
      }
      return session;
    },
  },

  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
