import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryOne, runtimeValue } from "../../../../lib/database";
import { getProject } from "../../../../lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
  const { id } = await context.params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  return Response.json({ project });
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
    const { id } = await context.params;
    const row = await queryOne<{ status: string }>("SELECT status FROM projects WHERE id = ? AND user_id = ? LIMIT 1", [id, user.id]);
    if (!row) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
    if (["ready", "failed", "cancelled"].includes(row.status)) {
      await execute("DELETE FROM projects WHERE id = ? AND user_id = ?", [id, user.id]);
      const runtimeProcess = typeof process !== "undefined" ? process : undefined;
      const getBuiltinModule = runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
      if (getBuiltinModule) {
        const fs = getBuiltinModule("node:fs") as typeof import("node:fs");
        const path = getBuiltinModule("node:path") as typeof import("node:path");
        const databasePath = runtimeValue("STORMCAST_DB_PATH") || path.resolve(process.cwd(), ".data/stormcast.db");
        const mediaRoot = path.resolve(runtimeValue("STORMCAST_MEDIA_DIR") || path.join(path.dirname(databasePath), "media"));
        for (const parent of [path.resolve(mediaRoot, "clips"), path.resolve(mediaRoot, "work")]) {
          const target = path.resolve(parent, ...(parent.endsWith(`${path.sep}clips`) ? [user.id, id] : [id]));
          if (target.startsWith(parent + path.sep)) {
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* DB ownership is already removed. */ }
          }
        }
      }
      return Response.json({ success: true, removed: true });
    }

    const now = Date.now();
    if (row.status === "queued") {
      await execute(
        "UPDATE projects SET status = 'cancelled', stage = 'Cancelado pelo usuário', progress = 0, cancel_requested = 1, updated_at = ?, completed_at = ? WHERE id = ? AND user_id = ?",
        [now, now, id, user.id],
      );
    } else {
      await execute(
        "UPDATE projects SET cancel_requested = 1, stage = 'Cancelamento solicitado', updated_at = ? WHERE id = ? AND user_id = ?",
        [now, id, user.id],
      );
    }
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Não foi possível cancelar o processamento." }, { status: 400 });
  }
}
