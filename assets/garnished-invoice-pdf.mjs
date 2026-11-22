// Garnished invoice PDF reader. Files are processed in-browser and never uploaded.
const PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const OCR="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let pdfjsPromise=null,ocrPromise=null;
function pdfjs(){
 if(!pdfjsPromise)pdfjsPromise=import(PDFJS).then(m=>{m.GlobalWorkerOptions.workerSrc=WORKER;return m});
 return pdfjsPromise;
}
function ocrLib(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!ocrPromise)ocrPromise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=OCR;script.async=true;
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error("Text recognition unavailable"));
  script.onerror=()=>reject(Error("Could not load text recognition library"));
  document.head.append(script);
 });
 return ocrPromise;
}
function linesFromItems(items){
 const placed=items.filter(i=>i.str?.trim()&&Array.isArray(i.transform)).map(i=>({str:i.str.trim(),x:i.transform[4],y:i.transform[5]}));
 const groups=[];
 for(const part of placed.sort((a,b)=>b.y-a.y||a.x-b.x)){
  const g=groups.find(a=>Math.abs(a.y-part.y)<=3);
  if(g)g.items.push(part);else groups.push({y:part.y,items:[part]});
 }
 return groups.sort((a,b)=>b.y-a.y).map(g=>g.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(" ").replace(/\s+/g," ").trim()).filter(Boolean);
}
export async function readGarnishedInvoicePdf(file,{progress=()=>{}}={}){
 if(!file||!(/\.pdf$/i.test(file.name)||file.type==="application/pdf"))throw Error("Choose a PDF file");
 if(file.size>12*1024*1024)throw Error("PDF must be 12 MB or smaller");
 const lib=await pdfjs();
 const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true});
 let doc;try{doc=await task.promise}catch(e){throw Error("Unable to read PDF. Check whether it is encrypted or damaged.")}
 const pages=Math.min(doc.numPages,8);
 if(doc.numPages>8)throw Error("For safety, import a PDF of up to 8 pages at a time");
 let text="",usedOcr=false,ocrWorker=null;
 try{
  for(let n=1;n<=pages;n++){
   progress("Reading page "+n+" of "+pages);
   const page=await doc.getPage(n),items=(await page.getTextContent()).items;
   let pageText=linesFromItems(items).join("\n");
   if(pageText.replace(/\s/g,"").length<25){
    progress("Recognizing scanned text on page "+n+" of "+pages);
    const lib=await ocrLib();
    if(!ocrWorker)ocrWorker=await lib.createWorker("eng");
    const vp=page.getViewport({scale:2});
    if(vp.width*vp.height>13000000)throw Error("Scanned page is too large for on-device recognition");
    const canvas=document.createElement("canvas");canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
    try{
     await page.render({canvasContext:canvas.getContext("2d",{willReadFrequently:true}),viewport:vp}).promise;
     const recognized=await ocrWorker.recognize(canvas);
     pageText=recognized.data.text||"";
     usedOcr=true;
    }finally{canvas.width=0;canvas.height=0}
   }
   text+="\n"+pageText+"\n";
  }
 }finally{
  if(ocrWorker)await ocrWorker.terminate().catch(()=>{});
  await task.destroy().catch(()=>{});
 }
 if(text.replace(/\s/g,"").length<30)throw Error("No readable invoice text was found. Try a clearer PDF scan.");
 progress("Extraction complete");
 return {text:text.slice(0,40000),pages,usedOcr};
}
function numericMoney(v){
 const x=Number(String(v||"").replace(/[$,\s]/g,""));
 return Number.isFinite(x)&&x>=0?x:null;
}
function dateISO(v){
 if(!v)return "";
 let s=String(v).trim();
 const iso=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
 if(iso)return iso[1]+"-"+iso[2].padStart(2,"0")+"-"+iso[3].padStart(2,"0");
 const md=s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
 if(md){const y=md[3].length===2?"20"+md[3]:md[3];if(+md[1]>=1&&+md[1]<=12&&+md[2]>=1&&+md[2]<=31)return y+"-"+md[1].padStart(2,"0")+"-"+md[2].padStart(2,"0")}
 const month=s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})/i);
 if(month){const idx=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(month[1].slice(0,3).toLowerCase());return month[3]+"-"+String(idx+1).padStart(2,"0")+"-"+month[2].padStart(2,"0")}
 return "";
}
export function suggestInvoiceFields(text){
 const lines=String(text||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const matchLine=(re)=>{for(const l of lines){const m=l.match(re);if(m)return m[1].trim()}return ""};
 const invoiceNumber=matchLine(/\b(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:no\.?|#))\s*[:#-]?\s*([a-z0-9][a-z0-9\-\/]{1,50})/i);
 let customer=matchLine(/^(?:bill\s*to|billed\s*to|customer|client)\s*[:\-]\s*(.+)$/i);
 if(!customer){const ix=lines.findIndex(x=>/^(?:bill\s*to|customer|client)\s*:?\s*$/i.test(x));if(ix>=0)customer=lines[ix+1]||""}
 const email=matchLine(/(?:email|e-mail)\s*:\s*([^\s]+@[^\s]+)/i);
 const dateValue=(labels)=>{for(const l of lines){const x=l.match(labels);if(x){const value=dateISO(x[1]);if(value)return value}}return ""};
 const issue=dateValue(/^(?:invoice date|issued|issue date|date)\s*[:\-]\s*(.+)$/i);
 const due=dateValue(/^(?:due date|payment due|due on)\s*[:\-]\s*(.+)$/i);
 const linesFound=[];
 const ignored=/^(?:sub\s*total|total|amount due|balance|tax|discount|deposit|paid|invoice|amount|qty|quantity|description|item|unit\s*price|shipping|terms|notes|date)\b/i;
 const amountPattern=/^(.{3,140}?)\s+(\d+(?:\.\d{1,3})?)\s+\$?([\d,]+(?:\.\d{1,2})?)\s+\$?([\d,]+(?:\.\d{1,2})?)$/;
 const qtyPricePattern=/^(.{3,140}?)\s+(\d+(?:\.\d{1,3})?)\s+\$?([\d,]+(?:\.\d{1,2})?)$/;
 for(const line of lines){
  if(ignored.test(line))continue;
  let m=line.match(amountPattern);let desc,qty,price;
  if(m){desc=m[1];qty=Number(m[2]);price=numericMoney(m[3]);const total=numericMoney(m[4]);if(total!==null&&Math.abs(qty*price-total)>Math.max(.05,total*.02))continue}
  else {m=line.match(qtyPricePattern);if(!m)continue;desc=m[1];qty=Number(m[2]);price=numericMoney(m[3])}
  if(!desc||!Number.isFinite(qty)||qty<=0||qty>100000||price===null||price>10000000)continue;
  if(linesFound.length<50)linesFound.push({description:desc,quantity:qty,unit_price:price});
 }
 const moneyField=(label)=>{const value=matchLine(label);return value?numericMoney(value):null};
 return {
  invoice_number:invoiceNumber,customer_name:customer.slice(0,200),
  customer_email:email.replace(/[;,.]$/,"").slice(0,254),
  issue_date:issue,due_date:due,
  tax_amount:moneyField(/^(?:sales\s*)?tax\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
  discount_amount:moneyField(/^discount\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
  deposit_required:moneyField(/^(?:deposit required|deposit requested)\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
  stated_total:moneyField(/^(?:grand total|invoice total|total)\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
  items:linesFound
 };
}