import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryAll, queryOne } from "../../../../lib/database";

export const dynamic = "force-dynamic";
type ProjectRow={id:string;user_id:string;owner_name:string;owner_email:string;title:string;source_platform:string;format:string;framing:string;status:string;stage:string;progress:number;credits_charged:number;created_at:number;updated_at:number;clip_count:number;error_message:string|null};
async function admin(request:Request){const user=await userFromRequest(request);return user?.role==="admin"?user:null;}

export async function GET(request:Request){
  if(!(await admin(request))) return NextResponse.json({error:"Acesso negado."},{status:403});
  const projects=await queryAll<ProjectRow>(`SELECT p.id,p.user_id,u.name owner_name,u.email owner_email,p.title,p.source_platform,p.format,p.framing,p.status,p.stage,p.progress,p.credits_charged,p.created_at,p.updated_at,p.error_message,
    (SELECT COUNT(*) FROM clips c WHERE c.project_id=p.id) clip_count FROM projects p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 500`);
  return NextResponse.json({projects:projects.map(p=>({id:p.id,userId:p.user_id,ownerName:p.owner_name,ownerEmail:p.owner_email,title:p.title,sourcePlatform:p.source_platform,format:p.format,framing:p.framing,status:p.status,stage:p.stage,progress:Number(p.progress),creditsCharged:Number(p.credits_charged),createdAt:Number(p.created_at),updatedAt:Number(p.updated_at),clipCount:Number(p.clip_count),errorMessage:p.error_message}))},{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(request:Request){
  try{assertSameOrigin(request);if(!(await admin(request)))return NextResponse.json({error:"Acesso negado."},{status:403});
    const {projectId,action}=await request.json() as {projectId?:string;action?:string};if(!projectId||action!=="cancel")return NextResponse.json({error:"Ação inválida."},{status:400});
    const project=await queryOne<{status:string}>("SELECT status FROM projects WHERE id=? LIMIT 1",[projectId]);if(!project)return NextResponse.json({error:"Projeto não encontrado."},{status:404});
    if(["ready","failed","cancelled"].includes(project.status))return NextResponse.json({error:"Este projeto já foi finalizado."},{status:409});
    await execute("UPDATE projects SET cancel_requested=1,stage='Cancelamento solicitado',updated_at=? WHERE id=?",[Date.now(),projectId]);return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Não foi possível cancelar o projeto."},{status:400});}
}

export async function DELETE(request:Request){
  try{assertSameOrigin(request);if(!(await admin(request)))return NextResponse.json({error:"Acesso negado."},{status:403});
    const {projectId}=await request.json() as {projectId?:string};if(!projectId)return NextResponse.json({error:"Projeto inválido."},{status:400});
    const project=await queryOne<{status:string}>("SELECT status FROM projects WHERE id=? LIMIT 1",[projectId]);if(!project)return NextResponse.json({error:"Projeto não encontrado."},{status:404});
    if(!["ready","failed","cancelled"].includes(project.status))return NextResponse.json({error:"Cancele e aguarde o projeto parar antes de excluí-lo."},{status:409});
    await execute("DELETE FROM projects WHERE id=?",[projectId]);return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Não foi possível excluir o projeto."},{status:400});}
}
