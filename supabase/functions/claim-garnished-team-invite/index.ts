import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS=new Set(["https://garnishedcatering901.garnishedcatering.workers.dev","https://garnishedcatering901.netlify.app"]);
const headers=o=>({"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://garnishedcatering901.garnishedcatering.workers.dev","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"",reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
 if(!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{headers:headers(origin)});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!secret)return reply({error:"Team invitation unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(jwt);
 if(authError||!user?.email||!user.email_confirmed_at)return reply({error:"Sign in with your verified invited email"},401);
 let body;try{body=await req.json()}catch{return reply({error:"Invalid request"},400)}
 const code=String(body.invitation_code||"");
 if(!/^[0-9a-f-]{36}$/i.test(code))return reply({error:"Invalid invitation code"},400);
 const {data:business,error}=await db.rpc("claim_garnished_team_invite_service",{p_invitation_code:code,p_claimant_id:user.id});
 if(error){
  const msg=String(error.message||"");
  if(/email|verified/i.test(msg))return reply({error:"Sign in with the verified email that received this invitation"},403);
  if(/expired|invalid|already used/i.test(msg))return reply({error:"This team invitation has expired or was already used"},410);
  if(/owns another workspace/i.test(msg))return reply({error:"This account already owns another workspace"},409);
  return reply({error:"Unable to accept team invitation"},422);
 }
 if(!business)return reply({error:"Could not join workspace"},500);
 return reply({accepted:true});
});
