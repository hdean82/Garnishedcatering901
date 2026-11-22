import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS = new Set(["https://garnishedcatering.com","https://garnishedcatering901.garnishedcatering.workers.dev","https://garnishedcatering901.netlify.app"]);
const headers=o=>({"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://garnishedcatering901.garnishedcatering.workers.dev","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"",reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
 if(!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{headers:headers(origin)});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const URL=Deno.env.get("SUPABASE_URL")||"",KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!URL||!KEY)return reply({error:"Client access unavailable"},503);
 const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(jwt);
 if(authError||!user?.email||!user.email_confirmed_at)return reply({error:"Sign in with the verified invited email"},401);
 let input;try{input=await req.json()}catch{return reply({error:"Invalid request"},400)}
 const code=String(input.invitation_code||"");
 if(!/^[0-9a-f-]{36}$/i.test(code))return reply({error:"Invalid invitation code"},400);
 const {data:claimed,error:claimError}=await db.rpc("claim_garnished_client_invite_service",{p_invitation_code:code,p_claimant_id:user.id});
 if(claimError){
  const message=String(claimError.message||"");
  if(/email address|verification/i.test(message))return reply({error:"Sign in with the verified invited email"},403);
  if(/expired|invalid|already accepted/i.test(message))return reply({error:"Invitation expired, invalid, or already used"},410);
  return reply({error:"Unable to accept invitation"},422);
 }
 if(!claimed)return reply({error:"Unable to activate client account"},500);
 return reply({accepted:true});
});
