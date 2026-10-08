const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error("Missing SOLANA_TRACKER_API_KEY");
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const wallet="3iMixB9t2XaGSpTyDa818beQEWzZ8E5yxxCWZW6VmFcX";
const mint="64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX";
const from=Date.parse("2026-10-05T04:40:00Z"),end=Date.parse("2026-10-05T05:05:00Z");
const out={token:"Charizard Strategy",mint,wallet,windowUTC:["2026-10-05T04:40:00Z","2026-10-05T05:05:00Z"],
 screenshot:{pnlPct:-69.1,holdMinutes:9},requests:0,trades:[],complete:false};
async function main(){
 try{
 let cursor=from,seen=new Set();
 for(let pageNo=0;pageNo<3;pageNo++){
  out.requests++;
  const p=await client.getUserTokenTradeHistory(mint,wallet,{events:"trades",sortDirection:"ASC",cursor,limit:500});
  const data=p.trades||[];
  for(const t of data){
   if(!Number.isFinite(t.time)||t.time<from||t.time>end)continue;
   const k=[t.tx,t.type,t.amount,t.time].join(":");if(seen.has(k))continue;seen.add(k);
   out.trades.push({type:t.type,time:t.time,timeUTC:new Date(t.time).toISOString(),
     amount:t.amount,priceUsd:t.priceUsd,volumeUsd:Number(t.volume)||Number(t.amount)*Number(t.priceUsd),
     volumeSol:t.volumeSol,tx:t.tx});
  }
  if(!p.hasNextPage||(data.length>0&&data.at(-1).time>end)){out.complete=true;break;}
  const next=Number(p.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){out.warning="Non-advancing cursor";break;}
  if(pageNo===2){out.warning="Three-page cap";break;}
  cursor=next;
 }
 out.trades.sort((a,b)=>a.time-b.time);
 const buys=out.trades.filter(t=>t.type==="buy"),sells=out.trades.filter(t=>t.type==="sell");
 const bought=buys.reduce((s,t)=>s+t.amount,0),sold=sells.reduce((s,t)=>s+t.amount,0);
 const paid=buys.reduce((s,t)=>s+t.volumeUsd,0),received=sells.reduce((s,t)=>s+t.volumeUsd,0);
 out.position={buyFills:buys.length,sellFills:sells.length,bought,sold,paidUsd:paid,receivedUsd:received,
  grossPnlPct:paid>0&&Math.abs(bought-sold)<=Math.max(bought,sold)*0.01?+((received/paid-1)*100).toFixed(3):null,
  holdMinutes:buys.length&&sells.length?+((sells.at(-1).time-buys[0].time)/60000).toFixed(2):null,
  flat:buys.length>0&&Math.abs(bought-sold)<=Math.max(bought,sold)*0.01};
 }finally{
  out.note="Gross estimate excludes gas, priority fees, bot tips and dashboard PNL methodology; trades outside window are not included.";
  fs.writeFileSync("charizard-lead-position-verification.json",JSON.stringify(out,null,2));
  console.log(JSON.stringify({requests:out.requests,complete:out.complete,warning:out.warning,position:out.position,trades:out.trades},null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
