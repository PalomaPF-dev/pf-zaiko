import { NextResponse } from "next/server";
import { countAdmins, deleteUser, getUserRole, updateUserRole } from "@/lib/authDb";
import { getSessionWithRole } from "@/lib/session";

export const runtime = "nodejs";

/** メンバー削除（管理者限定）。自分自身・最後の管理者・他社ユーザーは削除不可。 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    if (id === s.userId) {
      return NextResponse.json(
        { message: "自分自身は削除できません。" },
        { status: 400 }
      );
    }

    // 自社ユーザーのみ対象（他社ユーザーは null）
    const targetRole = await getUserRole(s.companyId, id);
    if (!targetRole) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }
    if (targetRole === "admin" && (await countAdmins(s.companyId)) <= 1) {
      return NextResponse.json(
        { message: "最後の管理者は削除できません。" },
        { status: 400 }
      );
    }

    await deleteUser(s.companyId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members] delete error:", err);
    return NextResponse.json({ message: "削除に失敗しました。" }, { status: 500 });
  }
}

/** 役割変更（管理者限定）。最後の管理者を一般に降格するのは不可。 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    if (body.role !== "admin" && body.role !== "member") {
      return NextResponse.json({ message: "役割の指定が正しくありません。" }, { status: 400 });
    }
    const role: "admin" | "member" = body.role;

    // 自社ユーザーのみ対象（他社ユーザーは null）
    const targetRole = await getUserRole(s.companyId, id);
    if (!targetRole) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }

    // 最後の管理者を一般に降格するのは不可（管理者不在を防ぐ）
    if (targetRole === "admin" && role === "member" && (await countAdmins(s.companyId)) <= 1) {
      return NextResponse.json(
        { message: "最後の管理者は一般に変更できません。" },
        { status: 400 }
      );
    }

    await updateUserRole(s.companyId, id, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members] patch error:", err);
    return NextResponse.json({ message: "変更に失敗しました。" }, { status: 500 });
  }
}
