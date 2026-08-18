import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryAll, queryOne, runtimeValue } from "../../../../lib/database";

export const dynamic="force-dynamic";
async function admin(request:Request){const user=await userFromRequest(request);return user?.role==="admin"?user:null;}
export async function GET(request:Request){
  if(!(await admin(request)))return NextResponse.json({error:"Acesso negado."},{status:403});
  const [settings,counts,activeSessions]=await Promise.all([
    queryAll<{key:string;value:string}>("SELECT key,value FROM app_settings"),
    queryAll<{status:string;total:number}>("SELECT status,COUNT(*) total FROM projects GROUP BY status"),
    queryOne<{total:number}>("SELECT COUNT(*) total FROM sessions WHERE expires_at>?",[Date.now()]),
  ]);
  const map=Object.fromEntries(settings.map(item=>[item.key,item.value]));
  return NextResponse.json({settings:{registrationEnabled:map.registration_enabled?map.registration_enabled==="1":runtimeValue("STORMCAST_DISABLE_REGISTRATION")!=="1",defaultCredits:Math.max(0,Math.trunc(Number(map.default_credits??120)||120))},processor:{enabled:runtimeValue("STORMCAST_PROCESSOR_ENABLED")!=="0",analysisModel:runtimeValue("OPENAI_ANALYSIS_MODEL")||"gpt-5-mini",transcriptionModel:runtimeValue("OPENAI_TRANSCRIPTION_MODEL")||"whisper-1",mediaDirectory:runtimeValue("STORMCAST_MEDIA_DIR")||".data/media",ytdlpConfigured:Boolean(runtimeValue("STORMCAST_YTDLP_PATH")),ffmpegConfigured:Boolean(runtimeValue("STORMCAST_FFMPEG_PATH"))},projects:Object.fromEntries(counts.map(item=>[item.status,Number(item.total)])),activeSessions:Number(activeSessions?.total||0),sessionDays:Math.max(1,Number(runtimeValue("STORMCAST_SESSION_DAYS")||30))},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request){
  try{assertSameOrigin(request);if(!(await admin(request)))return NextResponse.json({error:"Acesso negado."},{status:403});
    const body=await request.json() as {registrationEnabled?:boolean;defaultCredits?:number};const now=Date.now();
    if(typeof body.registrationEnabled==="boolean")await execute("INSERT INTO app_settings (key,value,updated_at) VALUES ('registration_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[body.registrationEnabled?"1":"0",now]);
    if(body.defaultCredits!==undefined){const credits=Math.max(0,Math.min(100000,Math.trunc(Number(body.defaultCredits)||0)));await execute("INSERT INTO app_settings (key,value,updated_at) VALUES ('default_credits',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[String(credits),now]);}
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Não foi possível salvar as configurações."},{status:400});}
}
