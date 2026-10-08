// Single-request Solana Tracker historical trade probe.
// ASC returns earliest indexed trades for the token; no pagination or wallet scans.
const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
const mint=(process.env.TEST_MINT||"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX").trim();
const key=process.env.SOLANA_TRACKER_API_KEY;
if(!key)throw Error("Missing SOLANA_TRACKER_API_KEY GitHub secret");
if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))throw Error("Invalid token mint");
async function main(){
 const report={mint,source:"solanatracker",mode:"earliest indexed token trades",limit:5,status:"pending"};
 try{
  const client=new Client({apiKey:key});
  const data=await client.getTokenTradeHistory(mint,{events:"trades",limit:5,sortDirection:"ASC"});
  const rows=Array.isArray(data?.trades)?data.trades:[];
  report.status="ok";
  report.count=rows.length;
  report.hasNextPage=Boolean(data?.hasNextPage);
  report.sample=rows.map(t=>({
   type:t.type, time:t.time, wallet:t.wallet, tx:t.tx||t.signature||null,
   amount:t.amount, priceUsd:t.priceUsd
  }));
  report.sampleKeys=rows[0]?Object.keys(rows[0]):[];
  report.note=rows.length?"Inspect dates before full history scan.":"No rows; this might be history coverage, plan access, or token support.";
 }catch(e){report.status="failed";report.error=String(e.message||e).slice(0,600);}
 fs.writeFileSync("solanatracker-probe.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,count:report.count,error:report.error,
  first:report.sample?.[0],sampleKeys:report.sampleKeys},null,2));
 if(report.status!=="ok")process.exitCode=1;
}
main();
