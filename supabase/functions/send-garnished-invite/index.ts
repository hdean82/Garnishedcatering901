import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGIN = "https://garnishedcatering901.netlify.app";
const cors = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(req.headers.get("origin")!==ORIGIN)return reply({error:"Invalid origin"},403);
 try {
 const bearer=req.headers.get("authorization")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!svc)return reply({error:"Email service is not configured"},503);
 const admin=createClient(url,svc,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await admin.auth.getUser(bearer.replace(/^Bearer\s+/i,""));
 if(userError||!userData.user)return reply({error:"Sign in again before inviting a team member"},401);
 const payload=await req.json();
 const email=String(payload.email||"").trim().toLowerCase();
 const role=payload.role==="staff"?"staff":"manager";
 const businessId=String(payload.business_id||"");
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return reply({error:"Enter a valid email address"},400);
 if(!/^[0-9a-f-]{36}$/i.test(businessId))return reply({error:"Invalid business"},400);
 const {data:business,error:ownerError}=await admin.from("businesses").select("id,name,owner_id").eq("id",businessId).single();
 if(ownerError||business?.owner_id!==userData.user.id)return reply({error:"Only the workspace owner can send invitations"},403);
 if(email===userData.user.email?.toLowerCase())return reply({error:"You already own this workspace"},400);
 const since=new Date(Date.now()-86400000).toISOString();
 const {count}=await admin.from("business_invites").select("id",{count:"exact",head:true}).eq("business_id",businessId).gte("created_at",since);
 if((count||0)>=15)return reply({error:"Daily invitation limit reached. Try tomorrow."},429);
 const {data:inv,error:insertErr}=await admin.from("business_invites").insert({business_id:businessId,role,recipient_email:email}).select("id,code").single();
 if(insertErr||!inv)return reply({error:"Could not create invitation"},500);
 const link=ORIGIN+"/?invite="+encodeURIComponent(inv.code);
 let deliveryMethod="";
 const resendKey=Deno.env.get("RESEND_API_KEY");
 const fromEmail=Deno.env.get("GARNISHED_FROM_EMAIL");
 let errorMessage="";
 if(resendKey&&fromEmail){
  const safeName=business.name.replace(/[<>&"]/g,"");
  const msg={from:fromEmail,to:[email],subject:"You're invited to "+business.name,html:`<div style="background:#f7f7f2;padding:32px;font-family:Arial,sans-serif;color:#24382c"><div style="max-width:560px;margin:auto;background:white;border:1px solid #d8e1da;border-radius:16px;padding:32px;text-align:center"><h1 style="font-family:Georgia,serif;font-weight:normal">GARNISH.ED</h1><p style="letter-spacing:2px;color:#66846c">CATERING 901</p><h2>You're invited to the team</h2><p>The owner of ${safeName} has invited you to join the shared business workspace.</p><p><a href="${link}" style="display:inline-block;background:#31583d;padding:14px 24px;border-radius:9px;color:white;text-decoration:none">Accept invitation</a></p><p style="font-size:12px;color:#68776d">This invitation expires in seven days. If you weren't expecting it, you can ignore this email.</p></div></div>`};
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify(msg)});
  if(sent.ok)deliveryMethod="resend";else errorMessage="Email provider rejected the invitation. Check sender verification and configuration.";
 } else {
  const {error:inviteErr}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:link});
  if(!inviteErr) deliveryMethod="supabase_auth";
  else {deliveryMethod="manual"; errorMessage="Automatic invitation email could not be delivered. Copy the pending invitation link from Team access instead."; }
 }
 if(!deliveryMethod){
  await admin.from("business_invites").delete().eq("id",inv.id);
  return reply({error:errorMessage||"Unable to send invitation"},422);
 }
 await admin.from("business_invites").update({delivery_method:deliveryMethod}).eq("id",inv.id);
 return reply({sent:deliveryMethod!=="manual",manual:deliveryMethod==="manual",method:deliveryMethod,recipient:email,expires_in_days:7,invitation_code:inv.code,notice:deliveryMethod==="manual"?errorMessage:null});
 }catch(e){return reply({error:"Invitation service failed. Try again."},500)}
});