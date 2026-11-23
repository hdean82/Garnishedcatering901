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
 const documentId=String(input.invoice_id||"");let linkedDocument=null;
 if(documentId){
  if(!/^[0-9a-f-]{36}$/i.test(documentId))return reply({error:"Invalid document"},400);
  const result=await db.from("invoices").select("id,invoice_number,document_type,status").eq("id",documentId).eq("business_id",businessId).eq("customer_id",customerId).maybeSingle();
  if(result.error||!result.data||!["sent","partial","paid","overdue"].includes(result.data.status))return reply({error:"The quote or invoice must be shared with this customer first"},400);
  linkedDocument=result.data;
 }
 const email=String(customer.email||"").trim().toLowerCase();
 if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Add a valid customer email in their profile first"},400);
 const {data:pending,error:pendingError}=await db.from("garnished_client_invites").select("id").eq("business_id",businessId).eq("customer_id",customerId).eq("recipient_email",email).is("claimed_at",null).gt("expires_at",new Date().toISOString()).limit(1);
 if(pendingError)return reply({error:"Unable to check pending invitations"},500);
 if(pending?.length)return reply({error:"A client invitation is already pending. Use the existing link in Team Access, or wait until it expires."},409);
 const cutoff=new Date(Date.now()-86400000).toISOString();
 const {count}=await db.from("garnished_client_invites").select("id",{count:"exact",head:true}).eq("business_id",businessId).gte("created_at",cutoff);
 if((count||0)>=15)return reply({error:"Daily client invitation limit reached"},429);
 const {data:invite,error:insertError}=await db.from("garnished_client_invites").insert({business_id:businessId,customer_id:customerId,recipient_email:email,created_by:user.id}).select("id,code").single();
 if(insertError||!invite)return reply({error:"Could not create customer invitation"},500);
 const link=origin+"/?client=1&show=invoices&invite="+encodeURIComponent(invite.code);
 const documentLabel=linkedDocument?.document_type==="quote"?"quote":"invoice";
 const documentTitle=linkedDocument?documentLabel+" "+linkedDocument.invoice_number:null;
 let delivery="manual",warning="Invitation email not delivered. Copy the invitation link from Client Access.";
 const resendKey=Deno.env.get("RESEND_API_KEY"),fromEmail=Deno.env.get("GARNISHED_FROM_EMAIL");
 if(resendKey&&fromEmail){
  const escapedNumber=String(linkedDocument?.invoice_number||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const heading=linkedDocument?(documentLabel==='quote'?"Your catering quote is ready":"Your catering invoice is ready"):"Welcome to your Garnished table";
  const body=linkedDocument?(documentLabel==='quote'?`We’ve put together quote ${escapedNumber} for your gathering. Take a look at the menu and pricing when you have a moment. If there’s a dish you’d like to swap or a detail we missed, leave us a message in your account.`:`Thanks for choosing Garnished for your table. You can find invoice ${escapedNumber} in your account, with the order details and balance together. If something looks off, send us a note there and we’ll take a look.`):"We’re glad you’re here! Your client account is where we’ll keep the details for your gathering. Come on in to see what we’ve put together.";
  const button=linkedDocument?(documentLabel==='quote'?'View my quote':'View my invoice'):'Open my client account';
  const content={from:fromEmail,to:[email],subject:documentTitle?'Your Garnished Catering '+documentTitle:heading,html:`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px 12px;background:#f4f5ef;color:#263b2e;font:16px Arial,sans-serif"><table role="presentation" width="100%" style="max-width:540px;margin:auto;background:#fff;border:1px solid #d8dfd4;border-radius:14px"><tr><td style="padding:28px"><img src="https://garnishedcatering.com/assets/garnished-circle-transparent.png" width="108" height="110" alt="Garnished Catering 901" style="display:block;margin:0 auto 22px"><h1 style="font:normal 28px Georgia,serif;color:#284632">${heading}</h1><p style="line-height:1.6">${body}</p><p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#315a40;color:white;text-decoration:none;font-weight:bold">${button}</a></p><p style="font:italic 17px Georgia,serif">Warmly,<br>The Garnished Catering team</p><p style="border-top:1px solid #d8dfd4;padding-top:14px;font-size:13px;color:#506253">This private invitation expires in seven days. Questions? Email us at Garnishedcatering@gmail.com.</p></td></tr></table></body></html>`};
  try{const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify(content)});if(r.ok){delivery="resend";warning=""}}catch{}
 }else{
  const {error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:link});
  if(!error){delivery="supabase_auth";warning=""}
 }
 await db.from("garnished_client_invites").update({delivery_method:delivery}).eq("id",invite.id);
 return reply({sent:delivery!=="manual",manual:delivery==="manual",method:delivery,recipient:email,invitation_code:invite.code,notice:warning});
});
