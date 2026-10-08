const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error("SOLANA_TRACKER_API_KEY missing");
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const mint="64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX";
const wallets=["72NWWbchKdRJKvhG6U4f9363psUttkeEkE4yk15imy8u","NUTN33YPQNsm68jwafcAsBps5aeGTCH16yWZnyRRtM8","7AygYDoPybfdQaf3v3nwT9u72g9M7to1mrWodazX14vc","sssssDdMNAWKingjpEojkTNdVuZrBe7FsJLaGtexe7d","CASHUTaewCTUqa6j2SzD6vgBMvMLsNjdpuBYGTxWDBmi","3wbezYhQgSoYRqPkzc9fdh6CvDULsWnRE9ZeNCVz1d6n","HQoHgRdpvWLHGMY7bX24s5cziX7D3Dezu99uR3PcqKaX","5QY3MBvLEsP4xjE4SNYJYPuwvJgoBUrDnvSaZUNsNHZT","BWBd3hj2MmSYYYFidfXeuWGqoednsdkdHqXU75C56xpt","4RMb8vyjiFXZ6WGrggNkVt721Ybd1FLKsTA35Hic2tvb","5mYXL2ikMRo8SoSHjXqwTtGAY76AckMmBdCW1LHTJNNN","DYXDDrZCLZVeak72eoPg7DgjYz1sW7tMaLY8PusDymQw","GV3LVViWota4Qod83uz7R1BTdWLABYpLYzcrueojSLED","dsegg9CXSkMxMCzPz9YEYQ3PKrsonoAZoc5Sguk4BFn"];
const from=Date.parse("2026-10-05T04:43:00Z"),to=Date.parse("2026-10-05T05:05:00Z");
const out={token:"Charizard Strategy",mint,windowUTC:["2026-10-05T04:43:00Z","2026-10-05T05:05:00Z"],target:{pnlPct:-69.1,holdMinutes:9},requestAttempts:0,results:[],note:"One-page wallet-specific requests only; a missing sell can be outside the time window or a data-provider omission."};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 try{
  for(const wallet of wallets){
   const row={wallet,status:"pending",trades:[],attempts:0};
   out.results.push(row);
   for(let i=0;i<3;i++){
    row.attempts++;out.requestAttempts++;
    try{
     const p=await client.getUserTokenTradeHistory(mint,wallet,{events:"trades",cursor:from,sortDirection:"ASC",limit:500});
     const all=p.trades||[];
     row.status="ok";row.hasNextPage=!!p.hasNextPage;
     row.complete=!p.hasNextPage||(all.length>0&&all.at(-1).time>to);
     row.trades=all.filter(t=>t.time>=from&&t.time<=to).map(t=>({type:t.type,time:t.time,timeUTC:new Date(t.time).toISOString(),amount:t.amount,volume:Number(t.volume)||Number(t.amount)*Number(t.priceUsd),tx:t.tx}));
     const buys=row.trades.filter(t=>t.type==="buy"),sells=row.trades.filter(t=>t.type==="sell");
     const inQty=buys.reduce((n,t)=>n+t.amount,0),outQty=sells.reduce((n,t)=>n+t.amount,0);
     const spent=buys.reduce((n,t)=>n+t.volume,0),earned=sells.reduce((n,t)=>n+t.volume,0);
     row.summary={buyFills:buys.length,sellFills:sells.length,buyQty:inQty,sellQty:outQty,
      grossPnlPct:inQty>0&&Math.abs(outQty-inQty)/inQty<0.05?+((earned/spent-1)*100).toFixed(2):null,
      holdMinutes:buys.length&&sells.length?+((sells.at(-1).time-buys[0].time)/60000).toFixed(2):null};
     break;
    }catch(e){
     row.error=String(e.message||e);
     if(!/rate.limit|429|too many/i.test(row.error)||i===2){row.status="error";break;}
     await delay(50000*(i+1));
    }
   }
   fs.writeFileSync("three-token-charizard-wallet-verification.json",JSON.stringify(out,null,2));
   console.log(wallet,row.status,row.summary||row.error);
   await delay(3500);
  }
 }finally{fs.writeFileSync("three-token-charizard-wallet-verification.json",JSON.stringify(out,null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
