import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS=new Set(["https://garnishedcatering901.garnishedcatering.workers.dev","https://garnishedcatering901.netlify.app"]);
const headers=o=>({"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://garnishedcatering901.garnishedcatering.workers.dev","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"",reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
 if(!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{headers:headers(origin)});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const URL=Deno.env.get("SUPABASE_URL")||"",KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!URL||!KEY)return reply({error:"Invitation service unavailable"},503);
 const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(jwt);
 if(authError||!user)return reply({error:"Sign in to invite a customer"},401);
 let input;try{input=await req.json()}catch{return reply({error:"Invalid request"},400)}
 const customerId=String(input.customer_id||""),businessId=String(input.business_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(customerId)||!/^[0-9a-f-]{36}$/i.test(businessId))return reply({error:"Invalid customer or business"},400);
 const {data:business}=await db.from("businesses").select("id,owner_id,name").eq("id",businessId).maybeSingle();
 if(!business||business.owner_id!==user.id)return reply({error:"Only the workspace owner can invite customers"},403);
 const {data:customer}=await db.from("customers").select("id,name,email").eq("id",customerId).eq("business_id",businessId).maybeSingle();
 if(!customer)return reply({error:"Customer not found"},404);
 const email=String(customer.email||"").trim().toLowerCase();
 if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Add a valid customer email in their profile first"},400);
 const cutoff=new Date(Date.now()-86400000).toISOString();
 const {count}=await db.from("garnished_client_invites").select("id",{count:"exact",head:true}).eq("business_id",businessId).gte("created_at",cutoff);
 if((count||0)>=15)return reply({error:"Daily client invitation limit reached"},429);
 const {data:invite,error:insertError}=await db.from("garnished_client_invites").insert({business_id:businessId,customer_id:customerId,recipient_email:email,created_by:user.id}).select("id,code").single();
 if(insertError||!invite)return reply({error:"Could not create customer invitation"},500);
 const link=origin+"/?client=1&invite="+encodeURIComponent(invite.code);
 let delivery="manual",warning="Invitation email not delivered. Copy the invitation link from Client Access.";
 const resendKey=Deno.env.get("RESEND_API_KEY"),fromEmail=Deno.env.get("GARNISHED_FROM_EMAIL");
 if(resendKey&&fromEmail){
  const safeName=business.name.replace(/[<>&"']/g,"");
  const content={from:fromEmail,to:[email],subject:"Your Garnished Catering client account",html:`<div style="background:#f5f6f1;padding:24px;font-family:Arial,sans-serif;color:#25382d"><div style="max-width:540px;margin:auto;background:white;padding:32px;border:1px solid #dce6dd;border-radius:12px"><h2 style="font-family:Georgia,serif">GARNISH.ED</h2><p>${safeName} has invited you to privately view invoices for your own customer account.</p><p><a style="display:inline-block;background:#315a40;padding:13px 20px;color:white;border-radius:8px;text-decoration:none" href="${link}">Open my client account</a></p><small>This private invitation expires in seven days. Check Spam or Junk if you don't see our emails.</small></div></div>`};
  try{const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify(content)});if(r.ok){delivery="resend";warning=""}}catch{}
 }else{
  const {error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:link});
  if(!error){delivery="supabase_auth";warning=""}
 }
 await db.from("garnished_client_invites").update({delivery_method:delivery}).eq("id",invite.id);
 return reply({sent:delivery!=="manual",manual:delivery==="manual",method:delivery,recipient:email,invitation_code:invite.code,notice:warning});
});
