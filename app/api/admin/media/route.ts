import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import {
  execute,
  queryAll,
  queryOne,
  runtimeValue,
} from "../../../../lib/database";
import { auditAdmin } from "../../../../lib/admin-audit";
export const dynamic = "force-dynamic";
function filesystem() {
  const runtimeProcess = typeof process !== "undefined" ? process : undefined,
    getBuiltinModule = runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
  if (!getBuiltinModule) return null;
  return {
    fs: getBuiltinModule("node:fs") as typeof import("node:fs"),
    path: getBuiltinModule("node:path") as typeof import("node:path"),
  };
}
function bytes(fs: typeof import("node:fs"), root: string) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const target = `${root}/${entry.name}`;
      if (entry.isDirectory()) total += bytes(fs, target);
      else total += fs.statSync(target).size;
    }
  } catch {}
  return total;
}
export async function GET(request: Request) {
  const admin = await userFromRequest(request);
  if (admin?.role !== "admin")
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const io = filesystem();
  if (!io)
    return NextResponse.json({
      supported: false,
      users: [],
      totalBytes: 0,
      tempBytes: 0,
    });
  const media = io.path.resolve(
      runtimeValue("STORMCAST_MEDIA_DIR") ||
        io.path.resolve(process.cwd(), ".data/media"),
    ),
    users = await queryAll<{ id: string; name: string; email: string }>(
      "SELECT id,name,email FROM users ORDER BY name",
    );
  const usage = users.map((user) => ({
    ...user,
    bytes: bytes(io.fs, io.path.resolve(media, "clips", user.id)),
  }));
  let disk = null;
  try {
    const stat = io.fs.statfsSync(media);
    disk = {
      freeBytes: Number(stat.bavail) * Number(stat.bsize),
      totalBytes: Number(stat.blocks) * Number(stat.bsize),
    };
  } catch {}
  const retention = await queryOne<{ value: string }>(
    "SELECT value FROM app_settings WHERE key='retention_days'",
  );
  const clips = await queryAll<{
    id: string;
    project_id: string;
    user_id: string;
    file_name: string;
    poster_file_name: string;
    title: string;
    owner_name: string;
  }>(`SELECT c.id,c.project_id,c.user_id,c.file_name,c.poster_file_name,c.title,u.name owner_name
      FROM clips c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 200`);
  const managedClips = clips.map((clip) => {
    const target = io.path.resolve(
      media,
      "clips",
      clip.user_id,
      clip.project_id,
      clip.file_name,
    );
    let size = 0;
    try {
      size = io.fs.statSync(target).size;
    } catch {}
    return { id: clip.id, title: clip.title, ownerName: clip.owner_name, size };
  });
  const workRoot = io.path.resolve(media, "work");
  let temporary: Array<{ name: string; size: number; updatedAt: number }> = [];
  try {
    temporary = io.fs
      .readdirSync(workRoot, { withFileTypes: true })
      .slice(0, 200)
      .map((entry) => {
        const target = io.path.resolve(workRoot, entry.name);
        const stat = io.fs.statSync(target);
        return {
          name: entry.name,
          size: entry.isDirectory() ? bytes(io.fs, target) : stat.size,
          updatedAt: stat.mtimeMs,
        };
      });
  } catch {}
  return NextResponse.json(
    {
      supported: true,
      users: usage,
      totalBytes: usage.reduce((sum, user) => sum + user.bytes, 0),
      tempBytes: bytes(io.fs, io.path.resolve(media, "work")),
      disk,
      mediaDirectory: media,
      retentionDays: Number(retention?.value || 30),
      clips: managedClips,
      temporary,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await userFromRequest(request);
    if (admin?.role !== "admin")
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const io = filesystem();
    if (!io)
      return NextResponse.json(
        { error: "Gerenciamento disponível somente na VPS." },
        { status: 409 },
      );
    const body = (await request.json()) as {
      kind?: "clip" | "temporary";
      id?: string;
      name?: string;
    };
    const media = io.path.resolve(
      runtimeValue("STORMCAST_MEDIA_DIR") ||
        io.path.resolve(process.cwd(), ".data/media"),
    );
    if (body.kind === "clip" && body.id) {
      const clip = await queryOne<{
        project_id: string;
        user_id: string;
        file_name: string;
        poster_file_name: string;
      }>(
        "SELECT project_id,user_id,file_name,poster_file_name FROM clips WHERE id=?",
        [body.id],
      );
      if (!clip)
        return NextResponse.json(
          { error: "MP4 não encontrado." },
          { status: 404 },
        );
      const parent = io.path.resolve(
        media,
        "clips",
        clip.user_id,
        clip.project_id,
      );
      for (const name of [clip.file_name, clip.poster_file_name]) {
        const target = io.path.resolve(parent, name);
        if (target.startsWith(parent + io.path.sep))
          io.fs.rmSync(target, { force: true });
      }
      await execute("DELETE FROM clips WHERE id=?", [body.id]);
      await auditAdmin(admin.id, "media.clip.delete", "clip", body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "temporary" && body.name) {
      const root = io.path.resolve(media, "work");
      const target = io.path.resolve(root, body.name);
      if (!target.startsWith(root + io.path.sep))
        return NextResponse.json(
          { error: "Caminho inválido." },
          { status: 400 },
        );
      io.fs.rmSync(target, { recursive: true, force: true });
      await auditAdmin(
        admin.id,
        "media.temporary.delete",
        "temporary",
        body.name,
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível excluir o item." },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await userFromRequest(request);
    if (admin?.role !== "admin")
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const io = filesystem();
    if (!io)
      return NextResponse.json(
        { error: "Limpeza disponível somente na VPS." },
        { status: 409 },
      );
    const setting = await queryOne<{ value: string }>(
      "SELECT value FROM app_settings WHERE key='retention_days'",
    );
    const days = Math.max(1, Math.min(365, Number(setting?.value) || 30)),
      cutoff = Date.now() - days * 86400000,
      media = io.path.resolve(
        runtimeValue("STORMCAST_MEDIA_DIR") ||
          io.path.resolve(process.cwd(), ".data/media"),
      );
    let removed = 0;
    const work = io.path.resolve(media, "work");
    try {
      for (const name of io.fs.readdirSync(work)) {
        const target = io.path.resolve(work, name);
        if (
          target.startsWith(work + io.path.sep) &&
          io.fs.statSync(target).mtimeMs < Date.now() - 86400000
        ) {
          io.fs.rmSync(target, { recursive: true, force: true });
          removed++;
        }
      }
    } catch {}
    const old = await queryAll<{ id: string; user_id: string }>(
      "SELECT id,user_id FROM projects WHERE status IN ('ready','failed','cancelled') AND updated_at<?",
      [cutoff],
    );
    for (const project of old) {
      const target = io.path.resolve(
        media,
        "clips",
        project.user_id,
        project.id,
      );
      if (target.startsWith(media + io.path.sep)) {
        try {
          io.fs.rmSync(target, { recursive: true, force: true });
          removed++;
        } catch {}
      }
    }
    await auditAdmin(admin.id, "media.cleanup", "system", null, {
      days,
      removed,
    });
    return NextResponse.json({ ok: true, removed, retentionDays: days });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível executar a limpeza." },
      { status: 400 },
    );
  }
}
