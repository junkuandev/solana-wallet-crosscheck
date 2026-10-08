// Verify full Pairstreet fills of the three best timestamp/PnL candidates.
// Exactly one wallet-scoped Solana Tracker request per wallet (3 total).
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error("SOLANA_TRACKER_API_KEY missing");
const mint="6iQp3cxTYPKaHHRX3SnmuFisLdrr9DznDU6gKnQtpump";
const wallets=[
 "FUvwH5bP5nzTubENyNuQuikqYDB83q8ZbwNggTTAYDHN",
 "J1oLtuyF7VbYcYFqB457ZtVAs1aeZs3ZwWRARvAXwEEX",
 "6r4TCR3m5oreguuon8afSobZVJ3Re14f8UCPG12o7NKx"
];
const from=Date.parse("2026-10-05T04:21:00Z"),to=Date.parse("2026-10-05T04:26:00Z");
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const result={mint,windowUTC:["2026-10-05T04:21:00Z","2026-10-05T04:26:00Z"],targetPnlPct:174.3,requests:0,wallets:[],
 warning:"Wallet-only history shows trades, not authoritative platform realized PNL. Fees, other fills, outside-window activity and dashboard calculation can differ."};
async function main(){
 try{
  for(const wallet of wallets){
   const item={wallet,status:"pending",complete:false};
   result.wallets.push(item);
   try{
    const page=await client.getUserTokenTradeHistory(mint,wallet,{events:"trades",sortDirection:"ASC",limit:500,cursor:from});
    result.requests++;
    const all=page.trades||[];
    item.status="ok";
    item.hasNextPage=Boolean(page.hasNextPage);
    item.nextCursor=page.nextCursor??null;
    item.firstResponseTime=all[0]?.time??null;
    item.lastResponseTime=all.at(-1)?.time??null;
    item.trades=all.filter(x=>x.time>=from&&x.time<=to).map(t=>({
     wallet:t.wallet,type:t.type,time:t.time,timeUTC:new Date(t.time).toISOString(),
     amount:t.amount,priceUsd:t.priceUsd,volume:t.volume,volumeSol:t.volumeSol,tx:t.tx
    }));
    item.complete=!page.hasNextPage||(item.lastResponseTime!==null&&item.lastResponseTime>to);
    const buy=item.trades.filter(x=>x.type==="buy"),sell=item.trades.filter(x=>x.type==="sell");
    const spent=buy.reduce((n,t)=>n+(Number(t.volume)||Number(t.amount)*Number(t.priceUsd)),0);
    const received=sell.reduce((n,t)=>n+(Number(t.volume)||Number(t.amount)*Number(t.priceUsd)),0);
    const bought=buy.reduce((n,t)=>n+Number(t.amount),0),sold=sell.reduce((n,t)=>n+Number(t.amount),0);
    item.position={buyFills:buy.length,sellFills:sell.length,bought,sold,
      usdSpent:spent,usdReceived:received,
      estimatedGrossPnlPct:spent>0&&Math.abs(sold-bought)/bought<=0.05?
       +((received/spent-1)*100).toFixed(2):null,
      note:"Gross USD volume estimate; no trading fees included, position completeness not assured"};
   }catch(e){item.status="failed";item.error=String(e.message||e);}
  }
 }finally{
  fs.writeFileSync("pairstreet-wallet-verification.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify({requests:result.requests,wallets:result.wallets.map(x=>({
    wallet:x.wallet,status:x.status,complete:x.complete,position:x.position,error:x.error
  }))},null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
