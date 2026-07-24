import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { listWorkers } from "@/lib/db";
import { currentSiteScope } from "@/lib/scope";

export const runtime = "nodejs";

/**
 * 作業者API。一覧は作業者アカウント（users.role='worker'）から返す。
 * 旧「アプリ内名簿（workers テーブル）」は廃止（データは残置）。
 * 作業者アカウントの追加・削除はポータルのユーザー設定で行うため、POST/DELETE は 410。
 */

/** 作業者一覧（会社スコープ・role='worker' のアカウント）。 */
export async function GET() {
  const user = await getOptionalSession();
  if (!user) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  try {
    // 工場スコープが効いているときは、自工場の作業者＋工場未設定の作業者だけを選択肢にする
    const scope = await currentSiteScope();
    const workers = await listWorkers(user.companyId, scope?.factory ?? null);
    return NextResponse.json({ workers });
  } catch (err) {
    console.error("[workers] list error:", err);
    return NextResponse.json({ message: "取得に失敗しました。" }, { status: 500 });
  }
}

/** 廃止：作業者の追加はポータルで行う。 */
export async function POST() {
  return NextResponse.json(
    { error: "作業者アカウントはポータルのユーザー設定で管理します。" },
    { status: 410 }
  );
}

/** 廃止：作業者の削除はポータルで行う。 */
export async function DELETE() {
  return NextResponse.json(
    { error: "作業者アカウントはポータルのユーザー設定で管理します。" },
    { status: 410 }
  );
}
