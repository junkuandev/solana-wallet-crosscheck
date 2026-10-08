// Verify a Charizard candidate against Fomi Ai, then collect a bounded fallback wallet sample.
// Output explicitly distinguishes a missing match from incomplete pagination.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const apiKey=process.env.SOLANA_TRACKER_API_KEY;
if(!apiKey)throw Error("Missing SOLANA_TRACKER_API_KEY");
const mint="J2P3YpQGVhkBN4vDD6r4qvigNicj7K21xm4iSS1rpump";
const candidate="3iMixB9t2XaGSpTyDa818beQEWzZ8E5yxxCWZW6VmFcX";
const entry=Date.parse("2026-10-05T05:05:00Z");
const limit=500,cap=3;
const client=new Client({apiKey});
const windows=[
 {name:"entry",from:entry-120000,to:entry+120000,type:"buy"},
 {name:"exit",from:entry+6*60000,to:entry+12*60000,type:"sell"}
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scan(w) {
 const events=[],seen=new Set();
 let cursor=w.from,requests=0,complete=false,problem=null,lastTime=null;
 for(let i=0;i<cap;i++){
  const page=await client.getTokenTradeHistory(mint,{events:"trades",sortDirection:"ASC",limit,cursor});
  requests++;
  const trades=page.trades||[];
  for(const t of trades){
   if(!Number.isFinite(t.time))continue;
   lastTime=t.time;
   if(t.time>w.to){complete=true;break;}
   if(t.time<w.from||t.type!==w.type)continue;
   const id=[t.tx,t.wallet,t.type,t.time,t.amount].join("|");
   if(!seen.has(id)){
    seen.add(id);
    events.push({wallet:t.wallet,time:t.time,tx:t.tx,type:t.type,amount:t.amount,
      priceUsd:t.priceUsd,volumeSol:t.volumeSol});
   }
  }
  if(complete||!page.hasNextPage){complete=true;break;}
  const next=Number(page.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){problem="Non-advancing timestamp cursor";break;}
  if(i===cap-1){problem="Page cap reached";break;}
  cursor=next;
  await sleep(400);
 }
 return {name:w.name,fromUTC:new Date(w.from).toISOString(),toUTC:new Date(w.to).toISOString(),
   complete,problem,requests,lastTimeUTC:lastTime?new Date(lastTime).toISOString():null,events};
}
async function main(){
 const result={mint,preset:"vol-tight",targetEntryUTC:"2026-10-05T05:05:00Z",
   targetHoldMinutes:9,targetPnlPct:118.6,charizardCandidate:candidate,
   scan:[],candidateTrades:[],matches:[],
   warning:"No matching trade is inconclusive when windows are incomplete, or if entry/exit times are rounded."};
 for(const w of windows)result.scan.push(await scan(w));
 const buys=result.scan[0].events.filter(t=>t.wallet===candidate);
 const sells=result.scan[1].events.filter(t=>t.wallet===candidate);
 result.candidateTrades=[...buys,...sells].map(t=>({...t,timeUTC:new Date(t.time).toISOString()}));
 for(const buy of buys)for(const sell of sells){
  const hold=(sell.time-buy.time)/60000;
  if(hold<=0||Math.abs(hold-9)>2)continue;
  const quantityRatio=sell.amount/buy.amount;
  const comparable=Number.isFinite(quantityRatio)&&Math.abs(quantityRatio-1)<=0.05;
  const pnl=comparable?(sell.amount*sell.priceUsd/(buy.amount*buy.priceUsd)-1)*100:null;
  result.matches.push({wallet:candidate,buyTx:buy.tx,sellTx:sell.tx,
    holdMinutes:Number(hold.toFixed(2)),quantityRatio:Number(quantityRatio.toFixed(4)),
    estimatedGrossPnlPct:pnl===null?null:Number(pnl.toFixed(2)),
    pnlDeviationPct:pnl===null?null:Number(Math.abs(pnl-118.6).toFixed(2))});
 }
 result.complete=result.scan.every(x=>x.complete);
 result.requests=result.scan.reduce((n,x)=>n+x.requests,0);
 result.windowSummary=result.scan.map(x=>({name:x.name,complete:x.complete,problem:x.problem,
    count:x.events.length,requests:x.requests,lastTimeUTC:x.lastTimeUTC}));
 fs.writeFileSync("fomi-crosscheck.json",JSON.stringify(result,null,2));
 console.log(JSON.stringify({complete:result.complete,requests:result.requests,windows:result.windowSummary,
    candidateTrades:result.candidateTrades.length,matches:result.matches},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
