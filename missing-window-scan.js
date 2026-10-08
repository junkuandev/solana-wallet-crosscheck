// Retrieve only the two gaps identified from locally analyzed prior artifacts.
// One small bounded history request per gap; capped to 2 pages each.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error("Missing SOLANA_TRACKER_API_KEY");
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const targets=[
 {token:"Charizard Strategy",mint:"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX",type:"buy",from:"2026-10-05T04:49:30Z",to:"2026-10-05T04:50:00Z"},
 {token:"Fomi Ai",mint:"J2P3YpQGVhkBN4vDD6r4qvigNicj7K21xm4iSS1rpump",type:"sell",from:"2026-10-05T05:14:27Z",to:"2026-10-05T05:17:00Z"}
];
async function run(t){
 const start=Date.parse(t.from),end=Date.parse(t.to),trades=[],seen=new Set();
 let cursor=start,complete=false,error=null,requests=0,lastTime=null;
 for(let i=0;i<2;i++){
  const p=await client.getTokenTradeHistory(t.mint,{events:"trades",sortDirection:"ASC",cursor,limit:500});
  requests++;
  for(const x of (p.trades||[])){
   if(!Number.isFinite(x.time))continue;
   lastTime=x.time;
   if(x.time>end){complete=true;break;}
   if(x.time<start||x.type!==t.type)continue;
   const id=[x.tx,x.wallet,x.time,x.amount,x.type].join("|");
   if(seen.has(id))continue;
   seen.add(id);
   trades.push({wallet:x.wallet,time:x.time,timeUTC:new Date(x.time).toISOString(),
     type:x.type,amount:x.amount,priceUsd:x.priceUsd,tx:x.tx,volumeSol:x.volumeSol});
  }
  if(complete||!p.hasNextPage){complete=true;break;}
  const next=Number(p.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){error="Non-advancing cursor";break;}
  if(i===1){error="Two-page cap reached";break;}
  cursor=next;
 }
 return {...t,requests,complete,error,lastTimeUTC:lastTime?new Date(lastTime).toISOString():null,trades};
}
async function main(){
 const results=[];
 try{for(const t of targets)results.push(await run(t));}
 finally{
  fs.writeFileSync("missing-window-trades.json",JSON.stringify({source:"Solana Tracker",results,
   note:"A repeated same-millisecond timestamp cursor may miss transactions; don't treat absence as proof."},null,2));
 }
 console.log(JSON.stringify(results.map(({trades,...other})=>({...other,count:trades.length})),null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
