import { allowRequest, assertSameOrigin, clientAddress, userFromRequest } from "../../../../lib/auth";
import { inspectYouTube, YouTubeInspectionError } from "../../../../lib/youtube";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
    if (!allowRequest(`youtube-metadata:${user.id}:${clientAddress(request)}`, 12, 10 * 60_000)) {
      return Response.json({ error: "Muitas consultas em sequência. Aguarde alguns minutos." }, { status: 429 });
    }

    const body = await request.json().catch(() => null) as { url?: unknown } | null;
    if (!body || typeof body.url !== "string") {
      return Response.json({ error: "Informe o link do YouTube." }, { status: 400 });
    }

    return Response.json({ metadata: await inspectYouTube(body.url) });
  } catch (error) {
    if (error instanceof YouTubeInspectionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Não foi possível consultar o vídeo agora." }, { status: 500 });
  }
}
