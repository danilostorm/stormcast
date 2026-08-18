import { execute } from "./database";
import { randomToken } from "./security";

export async function auditAdmin(
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string | null,
  details: Record<string, unknown> = {},
) {
  await execute(
    "INSERT INTO admin_audit (id,admin_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?,?)",
    [
      randomToken(16),
      adminId,
      action.slice(0, 80),
      targetType.slice(0, 40),
      targetId || null,
      JSON.stringify(details).slice(0, 4000),
      Date.now(),
    ],
  );
}
