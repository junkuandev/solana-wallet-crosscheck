// Verify leading Pairstreet wallets on Charizard Strategy and Fomi Ai.
// Four wallet-token API requests maximum; no token-wide pagination.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const apiKey=process.env.SOLANA_TRACKER_API_KEY;
if(!apiKey)throw Error("Missing SOLANA_TRACKER_API_KEY");
const client=new Client({apiKey});
const wallets=[
"FUvwH5bP5nzTubENyNuQuikqYDB83q8ZbwNggTTAYDHN",
"J1oLtuyF7VbYcYFqB457ZtVAs1aeZs3ZwWRARvAXwEEX"];
const tokens=[
{name:"Charizard Strategy",mint:"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX",start:"2026-10-05T04:40:00Z",end:"2026-10-05T05:05:00Z",pnlTarget:-69.1,holdTarget:9},
{name:"Fomi Ai",mint:"J2P3YpQGVhkBN4vDD6r4qvigNicj7K21xm4iSS1rpump",start:"2026-10-05T05:00:00Z",end:"2026-10-05T05:25:00Z",pnlTarget:118.6,holdTarget:9}];
const output={description:"Pairstreet wallet cross-token verification",wallets,tokens,requests:0,results:[],limitations:[]};
function summarize(rows) {
 const buys=rows.filter(t=>t.type==="buy"),sells=rows.filter(t=>t.type==="sell");
 const buyQty=buys.reduce((a,t)=>a+t.amount,0),sellQty=sells.reduce((a,t)=>a+t.amount,0);
 const paid=buys.reduce((a,t)=>a+t.usdVolume,0),received=sells.reduce((a,t)=>a+t.usdVolume,0);
 return {buyCount:buys.length,sellCount:sells.length,bought:buyQty,sold:sellQty,
  grossUsdPaid:paid,grossUsdReceived:received,
  grossPnlPercent:paid>0&&Math.abs(buyQty-sellQty)<=Math.max(buyQty,sellQty)*0.05?+(100*(received/paid-1)).toFixed(2):null,
  firstBuyUTC:buys.length?buys[0].timeUTC:null,lastSellUTC:sells.length?sells.at(-1).timeUTC:null};
}
async function main(){
 try {
  for(const token of tokens)for(const wallet of wallets){
   const entry={token:token.name,mint:token.mint,wallet,status:"pending"};
   output.results.push(entry);
   try{
    const start=Date.parse(token.start),end=Date.parse(token.end);
    output.requests++;
    const page=await client.getUserTokenTradeHistory(token.mint,wallet,{
     events:"trades",sortDirection:"ASC",cursor:start,limit:500});
    const trades=page.trades||[];
    entry.status="ok";
    entry.hasNextPage=!!page.hasNextPage;
    entry.lastReturnedUTC=trades.length?new Date(trades.at(-1).time).toISOString():null;
    entry.windowCovered=!page.hasNextPage||(trades.length>0&&trades.at(-1).time>end);
    entry.trades=trades.filter(t=>Number.isFinite(t.time)&&t.time>=start&&t.time<=end)
     .map(t=>({type:t.type,time:t.time,timeUTC:new Date(t.time).toISOString(),amount:t.amount,
      usdVolume:Number(t.volume)||Number(t.amount)*Number(t.priceUsd),volumeSol:t.volumeSol,tx:t.tx}));
    entry.summary=summarize(entry.trades);
   }catch(e){entry.status="error";entry.error=String(e.message||e).slice(0,500);}
  }
 }finally{
  output.limitations.push("A wallet may trade outside these windows; one page per wallet/token, so incomplete pagination cannot rule it out.");
  output.limitations.push("Gross USD PNL excludes execution fees and may differ from the screenshot platform.");
  fs.writeFileSync("pairstreet-cross-token-verification.json",JSON.stringify(output,null,2));
  console.log(JSON.stringify({requests:output.requests,results:output.results.map(
   ({token,wallet,status,windowCovered,summary,error})=>({token,wallet,status,windowCovered,summary,error}))},null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
