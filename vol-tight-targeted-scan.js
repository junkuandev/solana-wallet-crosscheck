// Time-bounded vol-tight wallet candidates. Never scan mint from genesis.
// Run once, retain artifacts; pages capped to keep API usage predictable.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const key=process.env.SOLANA_TRACKER_API_KEY;
if(!key)throw Error("Missing SOLANA_TRACKER_API_KEY");
const mint=process.env.TEST_MINT||"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX";
const maxPages=Math.min(20,Math.max(1,Number(process.env.MAX_PAGES_PER_WINDOW||4)));
const pageLimit=500;
const target={name:"Charizard Strategy",mint,preset:"vol-tight",entryUTC:"2026-10-05T04:47:00Z",holdMinutes:9,pnlPct:-69.1};
const base=Date.parse(target.entryUTC);
const windows=[
 {label:"entry",from:base-120000,to:base+180000,kind:"buy"},
 {label:"exit",from:base+6*60000,to:base+12*60000,kind:"sell"}
];
const client=new Client({apiKey:key});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retrieve(w){
 let cursor=w.from,requests=0,truncated=false,reason="",last=null;
 const all=[],seen=new Set();
 for(let pageNo=0;pageNo<maxPages;pageNo++){
  let response;
  try {
   response=await client.getTokenTradeHistory(mint,{events:"trades",limit:pageLimit,sortDirection:"ASC",cursor});
  }catch(e){reason="API error: "+String(e.message||e);truncated=true;break;}
  requests++;
  const rows=response.trades||[];
  let reachedEnd=false;
  for(const r of rows){
   if(!Number.isFinite(r.time))continue;
   if(r.time>w.to){reachedEnd=true;break;}
   if(r.time<w.from||r.type!==w.kind)continue;
   const id=[r.tx,r.wallet,r.type,r.time,r.amount].join("|");
   if(seen.has(id))continue;
   seen.add(id);
   all.push({tx:r.tx,wallet:r.wallet,type:r.type,time:r.time,amount:r.amount,priceUsd:r.priceUsd,
    volume:r.volume,volumeSol:r.volumeSol,program:r.program});
  }
  if(reachedEnd||!response.hasNextPage||response.nextCursor==null){break;}
  // The trade cursor is a millisecond timestamp; a repeated cursor can skip same-ms records.
  const next=Number(response.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){truncated=true;reason="non-advancing timestamp cursor";break;}
  if(pageNo===maxPages-1){truncated=true;reason="page cap reached";break;}
  cursor=next;
  await sleep(450);
 }
 return {window:w.label,fromUTC:new Date(w.from).toISOString(),toUTC:new Date(w.to).toISOString(),
  requests,truncated,reason,records:all};
}
async function main(){
 const raw={target,source:"Solana Tracker token trade history",retrievedAt:new Date().toISOString(),windows:[]};
 for(const w of windows) raw.windows.push(await retrieve(w));
 const buys=raw.windows[0].records,sells=raw.windows[1].records;
 const sellByWallet=new Map();
 for(const s of sells){if(!s.wallet)continue;const ar=sellByWallet.get(s.wallet)||[];ar.push(s);sellByWallet.set(s.wallet,ar);}
 const matches=[];
 for(const b of buys)for(const s of sellByWallet.get(b.wallet)||[]){
  const minutes=(s.time-b.time)/60000;
  if(minutes<=0||Math.abs(minutes-target.holdMinutes)>2)continue;
  const buyCost=Number(b.amount)*Number(b.priceUsd);
  const sellValue=Number(s.amount)*Number(s.priceUsd);
  const qtyRatio=Number(s.amount)/Number(b.amount);
  const comparable=Number.isFinite(qtyRatio)&&qtyRatio>=0.95&&qtyRatio<=1.05&&buyCost>0;
  const pnl=comparable?(sellValue/buyCost-1)*100:null;
  matches.push({wallet:b.wallet,buyTimeUTC:new Date(b.time).toISOString(),
   sellTimeUTC:new Date(s.time).toISOString(),holdMinutes:Number(minutes.toFixed(2)),
   buyTx:b.tx,sellTx:s.tx,buyQty:b.amount,sellQty:s.amount,
   quantityRatio:Number(qtyRatio.toFixed(4)),
   estimatedGrossPnlPct:pnl===null?null:Number(pnl.toFixed(2)),
   pnlDifferencePct:pnl===null?null:Number(Math.abs(pnl-target.pnlPct).toFixed(2)),
   limitation:comparable?"Single buy/sell estimate; other trades and fees not reconstructed":
   "Different buy/sell quantities or invalid prices; cannot infer position PNL"});
 }
 matches.sort((a,b)=>(a.pnlDifferencePct??1e9)-(b.pnlDifferencePct??1e9));
 const out={target,complete:raw.windows.every(w=>!w.truncated),
  apiRequests:raw.windows.reduce((n,w)=>n+w.requests,0),
  windows:raw.windows.map(({records,...info})=>({...info,count:records.length})),
  candidateCount:matches.length,candidates:matches.slice(0,150),
  warning:"Candidate matches are not verified trades by the preset. Signatures, timing, position balance and net PNL require validation. Missing results with incomplete pages are inconclusive."};
 fs.writeFileSync("vol-tight-raw-trades.json",JSON.stringify(raw,null,2));
 fs.writeFileSync("vol-tight-candidates.json",JSON.stringify(out,null,2));
 console.log(JSON.stringify({complete:out.complete,apiRequests:out.apiRequests,windows:out.windows,
  candidateCount:out.candidateCount,top:out.candidates.slice(0,8)},null,2));
 if(!out.complete)console.warn("INCOMPLETE scan: do not interpret zero matches as zero wallets.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
