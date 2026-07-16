import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { listWorkplaces } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";

export const dynamic = "force-dynamic";

/** ヘッダの職場セレクタ用: 会社の職場一覧＋現在選択中の職場ID。 */
export async function GET() {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ workplaces: [], currentId: null });
  try {
    const [workplaces, current] = await Promise.all([
      listWorkplaces(session.companyId),
      resolveCurrentWorkplace(session.companyId),
    ]);
    return NextResponse.json({ workplaces, currentId: current?.id ?? null });
  } catch {
    return NextResponse.json({ workplaces: [], currentId: null });
  }
}
