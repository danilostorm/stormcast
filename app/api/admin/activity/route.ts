import { NextResponse } from "next/server";
import { userFromRequest } from "../../../../lib/auth";
import { queryAll } from "../../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "admin")
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const [audit, credits, failures] = await Promise.all([
    queryAll(
      "SELECT a.*,u.name admin_name FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 200",
    ),
    queryAll(
      "SELECT h.*,u.name user_name,a.name admin_name FROM credit_history h JOIN users u ON u.id=h.user_id LEFT JOIN users a ON a.id=h.admin_id ORDER BY h.created_at DESC LIMIT 200",
    ),
    queryAll(
      "SELECT p.id,p.title,p.error_message,p.completed_at,u.name user_name FROM projects p JOIN users u ON u.id=p.user_id WHERE p.status='failed' ORDER BY p.updated_at DESC LIMIT 100",
    ),
  ]);
  return NextResponse.json(
    { audit, credits, failures },
    { headers: { "Cache-Control": "no-store" } },
  );
}
