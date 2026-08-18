import { userFromRequest } from "../../../../../lib/auth";
import { queryOne, runtimeValue } from "../../../../../lib/database";

type RouteContext = { params: Promise<{ id: string }> };

type AssetRow = {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  poster_file_name: string;
};

function nodeModules() {
  const runtimeProcess = typeof process !== "undefined" ? process : undefined;
  const getBuiltinModule = runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
  if (!getBuiltinModule) return null;
  return {
    fs: getBuiltinModule("node:fs") as typeof import("node:fs"),
    path: getBuiltinModule("node:path") as typeof import("node:path"),
    stream: getBuiltinModule("node:stream") as typeof import("node:stream"),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
  const { id } = await context.params;
  const row = await queryOne<AssetRow>(
    "SELECT id, project_id, user_id, file_name, poster_file_name FROM clips WHERE id = ? AND user_id = ? LIMIT 1",
    [id, user.id],
  );
  if (!row) return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const modules = nodeModules();
  if (!modules) return Response.json({ error: "Os vídeos estão disponíveis apenas no servidor Ubuntu." }, { status: 503 });
  const { fs, path, stream } = modules;
  const url = new URL(request.url);
  const poster = url.searchParams.get("kind") === "poster";
  const fileName = poster ? row.poster_file_name : row.file_name;
  const databasePath = runtimeValue("STORMCAST_DB_PATH") || path.resolve(process.cwd(), ".data/stormcast.db");
  const mediaRoot = path.resolve(runtimeValue("STORMCAST_MEDIA_DIR") || path.join(path.dirname(databasePath), "media"));
  const projectRoot = path.resolve(mediaRoot, "clips", row.user_id, row.project_id);
  const assetPath = path.resolve(projectRoot, fileName);
  if (!assetPath.startsWith(projectRoot + path.sep)) {
    return Response.json({ error: "Caminho de arquivo inválido." }, { status: 400 });
  }

  let stat: import("node:fs").Stats;
  try {
    stat = fs.statSync(assetPath);
  } catch {
    return Response.json({ error: "O arquivo ainda não está disponível." }, { status: 404 });
  }
  if (!stat.isFile()) return Response.json({ error: "Arquivo inválido." }, { status: 404 });

  const baseHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Type": poster ? "image/jpeg" : "video/mp4",
    "X-Content-Type-Options": "nosniff",
  });
  if (!poster && url.searchParams.get("download") === "1") {
    baseHeaders.set("Content-Disposition", `attachment; filename="stormcast-${row.id}.mp4"`);
  }

  const range = !poster ? request.headers.get("range") : null;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    if ((!match[1] && !match[2]) || (!match[1] && Number(match[2]) <= 0)) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
    const start = suffixLength ? Math.max(0, stat.size - suffixLength) : match[1] ? Number(match[1]) : 0;
    const requestedEnd = suffixLength ? stat.size - 1 : match[2] ? Number(match[2]) : stat.size - 1;
    const end = Math.min(requestedEnd, stat.size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    baseHeaders.set("Content-Length", String(end - start + 1));
    baseHeaders.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    const body = stream.Readable.toWeb(fs.createReadStream(assetPath, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: baseHeaders });
  }

  baseHeaders.set("Content-Length", String(stat.size));
  const body = stream.Readable.toWeb(fs.createReadStream(assetPath)) as ReadableStream;
  return new Response(body, { headers: baseHeaders });
}
