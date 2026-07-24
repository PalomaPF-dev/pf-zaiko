import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSql } from "@/lib/neon";
import { ensureSchema } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * POST /api/account/delete — アカウント削除（退会）。認証済み本人のみ。
 * - 自分が組織（会社）唯一のユーザー → 会社の全データ＋会社＋ユーザーを削除
 * - 他ユーザーがいて自分が唯一の管理者 → 削除不可（先に他の管理者を設定してもらう）
 * - それ以外 → 自分のユーザーのみ削除
 * 削除は sql.transaction で、外部キー制約（transactions の RESTRICT 等）に反しない順序で実行する。
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.companyId || !user?.id) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }
  if (user.isDemo) {
    return NextResponse.json(
      { message: "デモ利用中はアカウント削除は不要です（デモデータは自動的に削除されます）。" },
      { status: 400 }
    );
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const companyId = user.companyId;
    const userId = user.id;

    // 本人確認（セッションのユーザーが実在し、会社に属していること）
    const meRows = await sql`
      SELECT id, role FROM users WHERE id = ${userId} AND company_id = ${companyId} LIMIT 1`;
    const me = meRows[0] as { id: string; role: string | null } | undefined;
    if (!me) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }
    const myRole = (me.role ?? "admin") as "admin" | "member" | "worker";

    const countRows = await sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE COALESCE(role, 'admin') = 'admin') AS admins
      FROM users WHERE company_id = ${companyId}`;
    const total = Number((countRows[0] as { total: string }).total);
    const admins = Number((countRows[0] as { admins: string }).admins);

    if (total <= 1) {
      // 組織唯一のユーザー → 会社の全データごと削除。
      // transactions は products/locations を ON DELETE RESTRICT で参照するため、子から順に削除する。
      await sql.transaction([
        sql`DELETE FROM transactions WHERE company_id = ${companyId}`,
        sql`DELETE FROM stock WHERE company_id = ${companyId}`,
        sql`DELETE FROM stocktake_lines WHERE company_id = ${companyId}`,
        sql`DELETE FROM stocktakes WHERE company_id = ${companyId}`,
        sql`DELETE FROM issue_order_lines WHERE company_id = ${companyId}`,
        sql`DELETE FROM issue_orders WHERE company_id = ${companyId}`,
        sql`DELETE FROM issue_order_counters WHERE company_id = ${companyId}`,
        sql`DELETE FROM receipt_lines WHERE company_id = ${companyId}`,
        sql`DELETE FROM receipts WHERE company_id = ${companyId}`,
        sql`DELETE FROM receipt_counters WHERE company_id = ${companyId}`,
        sql`DELETE FROM products WHERE company_id = ${companyId}`,
        sql`DELETE FROM locations WHERE company_id = ${companyId}`,
        sql`DELETE FROM loc_counters WHERE company_id = ${companyId}`,
        sql`DELETE FROM loc_areas WHERE company_id = ${companyId}`,
        sql`DELETE FROM partners WHERE company_id = ${companyId}`,
        // users は companies から ON DELETE CASCADE、password_reset_tokens は users から CASCADE
        sql`DELETE FROM companies WHERE id = ${companyId}`,
      ]);
      return NextResponse.json({ ok: true, deleted: "company" });
    }

    if (myRole === "admin" && admins <= 1) {
      return NextResponse.json(
        {
          message:
            "あなたはこの会社で唯一の管理者のため、削除できません。マスタ設定の「ユーザーと役割」で先に他の管理者を設定してください。",
        },
        { status: 400 }
      );
    }

    // 他のユーザーが残る場合は自分のユーザーのみ削除（password_reset_tokens は CASCADE）
    await sql`DELETE FROM users WHERE id = ${userId} AND company_id = ${companyId}`;
    return NextResponse.json({ ok: true, deleted: "user" });
  } catch (err) {
    console.error("[account/delete] error:", err);
    return NextResponse.json(
      { message: "削除に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
