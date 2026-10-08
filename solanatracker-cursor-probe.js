// Test whether Solana Tracker's swap-history timestamp cursor permits jumping to the trade window.
// Single API request, never automatically paginate.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const apiKey=process.env.SOLANA_TRACKER_API_KEY;
const mint=process.env.TEST_MINT||"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX";
if(!apiKey)throw Error("Missing SOLANA_TRACKER_API_KEY");
const target="2026-10-05T04:45:00Z";
const cursor=Date.parse(target);
async function main(){
 const report={mint,targetUTC:target,cursor,limit:10,requestCount:1,status:"pending"};
 try{
  const client=new Client({apiKey});
  const page=await client.getTokenTradeHistory(mint,{
   events:"trades",limit:10,sortDirection:"ASC",cursor
  });
  report.status="ok";report.count=page.trades?.length||0;
  report.hasNextPage=page.hasNextPage;
  report.nextCursor=page.nextCursor??null;
  report.sample=(page.trades||[]).map(x=>({timeUTC:new Date(x.time).toISOString(),
   time:x.time,wallet:x.wallet,type:x.type,amount:x.amount,priceUsd:x.priceUsd,tx:x.tx}));
  report.cursorJumpAppearsValid=report.sample.length>0&&report.sample.every(x=>x.time>=cursor);
  report.note=report.cursorJumpAppearsValid?"Trades are at or after target; inspect proximity.":"Cursor did not prove targeted history access. Do not paginate yet.";
 }catch(e){report.status="failed";report.error=String(e.message||e);}
 fs.writeFileSync("solanatracker-cursor-probe.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,count:report.count,first:report.sample?.[0],
  cursorJumpAppearsValid:report.cursorJumpAppearsValid,error:report.error},null,2));
 if(report.status!=="ok")process.exitCode=1;
}
main();