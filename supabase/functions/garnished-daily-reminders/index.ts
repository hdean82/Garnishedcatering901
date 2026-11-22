import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const serviceUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const jobSecret=Deno.env.get("GARNISHED_REMINDER_JOB_SECRET")||"";
const emailKey=Deno.env.get("RESEND_API_KEY")||"";
const sender=Deno.env.get("GARNISHED_FROM_EMAIL")||"";
async function sameSecret(actual:string,expected:string){
 if(!actual||!expected)return false;
 const data=await Promise.all([actual,expected].map(x=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(x))));
 const a=new Uint8Array(data[0]),b=new Uint8Array(data[1]);
 return a.length===b.length&&a.every((x,i)=>x===b[i]);
}
function localClock(now:Date,zone:string){
 try{
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:zone||"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
  const p=Object.fromEntries(fmt.formatToParts(now).map(x=>[x.type,x.value]));
  return {day:p.year+"-"+p.month+"-"+p.day,hour:Number(p.hour)};
 }catch{return null}
}
Deno.serve(async request=>{
 if(request.method!=="POST")return reply({error:"POST required"},405);
 const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!await sameSecret(bearer,jobSecret))return reply({error:"Unauthorized"},401);
 if(!serviceUrl||!serviceKey||!emailKey||!sender)return reply({error:"Reminder service not fully configured"},503);
 const db=createClient(serviceUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:businesses,error}=await db.from("businesses").select("id,timezone,reminder_digest_hour,reminder_digest_email").eq("reminder_digest_enabled",true).not("reminder_digest_email","is",null).limit(100);
 if(error)return reply({error:"Could not load opt-ins"},500);
 const now=new Date(),out:{business_id:string,status:string}[]=[];
 for(const business of businesses||[]){
  const clock=localClock(now,business.timezone||"America/Chicago");
  if(!clock||clock.hour!==business.reminder_digest_hour)continue;
  const recipient=String(business.reminder_digest_email||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))continue;
  const [{data:tasks,error:tasksError},{data:invoices,error:invoiceError}]=await Promise.all([
   db.from("tasks").select("id,due_at,remind_at,status").eq("business_id",business.id).neq("status","done").limit(1000),
   db.from("invoices").select("id,due_date,status").eq("business_id",business.id).in("status",["sent","partial","overdue"]).limit(1000)
  ]);
  if(tasksError||invoiceError){out.push({business_id:business.id,status:"query_error"});continue}
  const soon=now.getTime()+86400000;
  const dueTasks=(tasks||[]).filter(t=>(t.due_at&&Date.parse(t.due_at)<=soon)||(t.remind_at&&Date.parse(t.remind_at)<=now.getTime())).length;
  const dueInvoices=(invoices||[]).filter(i=>i.due_date&&i.due_date<=clock.day).length;
  if(dueTasks+dueInvoices===0){out.push({business_id:business.id,status:"nothing_due"});continue}
  const {error:reserveError}=await db.from("garnished_reminder_dispatches").insert({business_id:business.id,local_date:clock.day,recipient_email:recipient,status:"reserved"});
  if(reserveError){out.push({business_id:business.id,status:reserveError.code==="23505"?"already_processed":"reservation_failed"});continue}
  const plain=[
   "Garnished Catering daily reminder for "+clock.day,"",
   dueTasks+" tasks are overdue, due in 24 hours, or have reached their reminder date.",
   dueInvoices+" open invoice records have a due date on or before today.","",
   "Open your private Studio: https://garnishedcatering901.garnishedcatering.workers.dev/?team=1","",
   "Please verify payment status before following up with customers."
  ].join("\n");
  try{
   const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+emailKey,"Content-Type":"application/json","Idempotency-Key":"garnished-digest-"+business.id+"-"+clock.day},
    body:JSON.stringify({from:sender,to:[recipient],subject:"Garnished Catering: your daily task and invoice reminder",text:plain})
   });
   if(!response.ok)throw Error("Provider HTTP "+response.status);
   const sent=await response.json().catch(()=>({}));
   await db.from("garnished_reminder_dispatches").update({status:"sent",provider_id:sent.id||null,sent_at:new Date().toISOString()}).eq("business_id",business.id).eq("local_date",clock.day);
   out.push({business_id:business.id,status:"sent"});
  }catch{
   await db.from("garnished_reminder_dispatches").update({status:"failed"}).eq("business_id",business.id).eq("local_date",clock.day);
   out.push({business_id:business.id,status:"send_failed_manual_review_required"});
  }
 }
 return reply({checked:(businesses||[]).length,results:out});
});