import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const BUSINESS_ID="20ca7762-5613-4bab-a9b4-2bece2ef234e";
const ALLOWED=new Set(["https://garnishedcatering.com","https://www.garnishedcatering.com","https://garnishedcatering901.garnishedcatering.workers.dev"]);
const str=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
const headers=(origin:string)=>({"Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://garnishedcatering.com","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"OPTIONS,POST","Content-Type":"application/json","Vary":"Origin","Cache-Control":"no-store"});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
 if(!ALLOWED.has(origin))return send({error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return send({error:"Method not allowed"},405);
 const len=Number(req.headers.get("content-length")||0);
 if(len>12000)return send({error:"Request too large"},413);
 let value:Record<string,unknown>;
 try{value=await req.json();if(!value||typeof value!=="object"||Array.isArray(value))throw Error()}catch{return send({error:"Invalid form data"},400)}
 if(value.website)return send({received:true}); // honeypot: do not reveal filtering
 const name=str(value.contact_name,120),email=str(value.email,254).toLowerCase(),phone=str(value.phone,40);
 const type=str(value.event_type,80),date=str(value.event_date,15),flex=value.date_flexible===true;
 const count=value.guest_count?Number(value.guest_count):null;
 if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!type)return send({error:"Name, valid email and event type are required"},400);
 if(!date&&!flex)return send({error:"Choose an event date or mark it flexible"},400);
 if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return send({error:"Invalid date"},400);
 if(date&&(!Number.isFinite(Date.parse(date))||Date.parse(date)<Date.now()-86400000))return send({error:"Choose a current or future date"},400);
 if(!Number.isInteger(count)||count<1||count>100000)return send({error:"Guest count must be between 1 and 100,000"},400);
 const validTypes=new Set(["Wedding","Corporate event","Birthday / celebration","Holiday gathering","Graduation","Family event","Community event","Other"]);
 const validStyles=new Set(["","Drop-off delivery","Pickup","Buffet setup","Plated service","Staffed catering","Not sure yet"]);
 const validBudgets=new Set(["","Under $500","$500–$1,000","$1,000–$2,500","$2,500–$5,000","$5,000+","Not sure yet"]);
 const service=str(value.service_style,80),budget=str(value.budget_range,80);
 if(!validTypes.has(type)||!validStyles.has(service)||!validBudgets.has(budget))return send({error:"Please choose a listed event option"},400);
 const api=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!api||!secret)return send({error:"Inquiry service unavailable. Please call Garnished Catering."},503);
 const client=createClient(api,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const address=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown";
 const raw=new TextEncoder().encode(BUSINESS_ID+":"+address+":"+new Date().toISOString().slice(0,10));
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",raw))).map(n=>n.toString(16).padStart(2,"0")).join("");
 const cutoff=new Date(Date.now()-3600000).toISOString();
 const {count:recent,error:rateError}=await client.from("garnished_inquiries").select("id",{count:"exact",head:true}).eq("rate_fingerprint",fingerprint).gte("created_at",cutoff);
 if(rateError)return send({error:"Please try again later"},503);
 if((recent||0)>=3)return send({error:"Too many inquiries from this connection. Please call us."},429);
 const record={
  business_id:BUSINESS_ID,contact_name:name,email,phone:phone||null,
  organization:str(value.organization,120)||null,event_type:type,event_date:date||null,date_flexible:flex,
  service_time:str(value.service_time,60)||null,guest_count:count,event_location:str(value.event_location,240)||null,
  service_style:service||null,menu_ideas:str(value.menu_ideas,1200)||null,
  dietary_notes:str(value.dietary_notes,700)||null,budget_range:budget||null,
  special_notes:str(value.special_notes,1500)||null,
  preferred_contact:value.preferred_contact==="phone"?"phone":"email",
  rate_fingerprint:fingerprint
 };
 const {error}=await client.from("garnished_inquiries").insert(record);
 if(error)return send({error:"Could not save inquiry. Please contact us by phone or email."},500);
 return send({received:true});
});