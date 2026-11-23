import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const ORIGINS = new Set(["https://garnishedcatering.com","https://garnishedcatering901.garnishedcatering.workers.dev","https://garnishedcatering901.netlify.app"]);
const headers=(origin)=>({"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://garnishedcatering901.garnishedcatering.workers.dev","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
 if(!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{headers:headers(origin)});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const URL=Deno.env.get("SUPABASE_URL")||"",KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!URL||!KEY)return reply({error:"Portal unavailable"},503);
 const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(jwt);
 if(authError||!user||!user.email_confirmed_at)return reply({error:"Sign in with a verified email"},401);
 const {data:access,error:accessErr}=await db.from("garnished_client_access").select("business_id,customer_id").eq("user_id",user.id).limit(20);
 if(accessErr)return reply({error:"Unable to load account"},500);
 if(!access?.length)return reply({businesses:[],invoices:[]});
 const accounts=[];
 for(const a of access){
  const {data:customer}=await db.from("customers").select("id,name,company_name,address").eq("id",a.customer_id).eq("business_id",a.business_id).maybeSingle();
  if(!customer)continue;
  const {data:business}=await db.from("businesses").select("name,phone,email,client_approval_terms").eq("id",a.business_id).maybeSingle();
  const {data:invoices}=await db.from("invoices").select("id,invoice_number,status,document_type,issue_date,due_date,deposit_required,tax_amount,discount_amount,event_id,fulfillment_method,delivery_address_mode,delivery_address,delivery_place_name,client_order_details").eq("business_id",a.business_id).eq("customer_id",a.customer_id).in("status",["sent","partial","paid","overdue"]).order("issue_date",{ascending:false}).limit(100);
  if(invoices===null)return reply({error:"Unable to load client invoices"},500);
  const ids=(invoices||[]).map(i=>i.id);
  let items=[],payments=[],events=[],messages=[],approvals=[];
  if(ids.length){
   const ir=await db.from("invoice_items").select("invoice_id,item_category,description,quantity,unit_price,position").eq("business_id",a.business_id).in("invoice_id",ids).order("position",{ascending:true});
   const pr=await db.from("payments").select("invoice_id,amount,paid_at,method").eq("business_id",a.business_id).in("invoice_id",ids);
   if(ir.error||pr.error)return reply({error:"Unable to load invoice details"},500);
   items=ir.data||[];payments=pr.data||[];
   const mr=await db.from("garnished_client_review_messages").select("id,invoice_id,author_role,body,created_at").eq("business_id",a.business_id).eq("customer_id",a.customer_id).in("invoice_id",ids).order("created_at",{ascending:true}).limit(300);
   const ar=await db.from("garnished_client_approvals").select("id,invoice_id,approved_at,approved_email,terms_snapshot").eq("business_id",a.business_id).eq("customer_id",a.customer_id).in("invoice_id",ids);
   if(mr.error||ar.error)return reply({error:"Unable to load review history"},500);
   messages=mr.data||[];approvals=ar.data||[];
   const eventIds=[...new Set((invoices||[]).map(i=>i.event_id).filter(Boolean))];
   if(eventIds.length){
    const result=await db.from("events").select("id,address").eq("business_id",a.business_id).in("id",eventIds);
    if(result.error)return reply({error:"Unable to load event delivery locations"},500);
    events=result.data||[];
   }
  }
  accounts.push({customer:{name:customer.name,company_name:customer.company_name},business:business||{name:"Garnished Catering"},invoices:(invoices||[]).map(i=>({
   id:i.id,business_id:a.business_id,customer_id:a.customer_id,
   invoice_number:i.invoice_number,status:i.status,document_type:i.document_type||"invoice",issue_date:i.issue_date,due_date:i.due_date,deposit_required:i.deposit_required,
   approval_terms:business?.client_approval_terms||null,
   review_messages:messages.filter(m=>m.invoice_id===i.id).map(({id,author_role,body,created_at})=>({id,author_role,body,created_at})),
   approval:approvals.find(a=>a.invoice_id===i.id)||null,
   tax_amount:i.tax_amount,discount_amount:i.discount_amount,client_order_details:i.client_order_details,
   fulfillment_method:i.fulfillment_method,delivery_place_name:i.delivery_place_name,
   delivery_display_address:i.fulfillment_method==="delivery"?
    (i.delivery_address_mode==="custom"?i.delivery_address:events.find(e=>e.id===i.event_id)?.address||customer.address||null):null,
   items:items.filter(x=>x.invoice_id===i.id).map(({item_category,description,quantity,unit_price})=>({item_category,description,quantity,unit_price})),
   payments:payments.filter(x=>x.invoice_id===i.id).map(({amount,paid_at,method})=>({amount,paid_at,method}))
  }))});
 }
 return reply({accounts});
});
