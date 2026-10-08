const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const key=process.env.SOLANA_TRACKER_API_KEY;if(!key)throw Error("Missing SOLANA_TRACKER_API_KEY");
const client=new Client({apiKey:key});
const wallet="J1oLtuyF7VbYcYFqB457ZtVAs1aeZs3ZwWRARvAXwEEX";
const mint="J2P3YpQGVhkBN4vDD6r4qvigNicj7K21xm4iSS1rpump";
const from=Date.parse("2026-10-05T05:00:00Z"),to=Date.parse("2026-10-05T05:25:00Z");
const out={wallet,mint,attempts:0,status:"pending",complete:false,trades:[]};
async function main(){
 try{
  for(let i=0;i<3;i++){
   out.attempts++;
   try{
    const p=await client.getUserTokenTradeHistory(mint,wallet,{events:"trades",sortDirection:"ASC",cursor:from,limit:500});
    const raw=p.trades||[];
    out.status="ok";out.complete=!p.hasNextPage||(raw.length>0&&raw.at(-1).time>to);
    out.hasNextPage=!!p.hasNextPage;
    out.trades=raw.filter(t=>t.time>=from&&t.time<=to).map(t=>({type:t.type,timeUTC:new Date(t.time).toISOString(),amount:t.amount,volume:t.volume,priceUsd:t.priceUsd,tx:t.tx}));
    break;
   }catch(e){
    out.error=String(e.message||e);
    if(!/rate.limit|429|too many/i.test(out.error)||i===2){out.status="error";break;}
    await new Promise(r=>setTimeout(r,(i+1)*45000));
   }
  }
 }finally{fs.writeFileSync("fomi-single-wallet-retry.json",JSON.stringify(out,null,2));console.log(JSON.stringify({wallet,status:out.status,complete:out.complete,attempts:out.attempts,trades:out.trades.length,error:out.error||null}));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
