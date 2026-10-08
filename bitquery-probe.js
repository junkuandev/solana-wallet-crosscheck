// Low-credit Bitquery probe: one bounded query for one known mint, up to 5 trades.
// The probe does not scan wallets or request historical pages.
const fs=require("node:fs");
const mint=process.env.TEST_MINT||"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX";
const token=process.env.BITQUERY_API_KEY;
if(!token)throw Error("Missing BITQUERY_API_KEY GitHub secret");
if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))throw Error("Invalid TEST_MINT");
const query=`query Probe($mint:String!,$since:DateTime!,$before:DateTime!) {
 Solana(dataset: realtime) {
  DEXTradeByTokens(
   where:{Trade:{Currency:{MintAddress:{is:$mint}}},
     Block:{Time:{since:$since,before:$before}},
     Transaction:{Result:{Success:true}}}
   orderBy:{ascending:Block_Time}
   limit:{count:5}
  ){
   Block{Time}
   Transaction{Signature Signer}
   Trade{Currency{MintAddress} Side{Type Currency{MintAddress}}}
  }
 }
}`;
async function main(){
 const historical=process.env.PROBE_MODE==="historical";
 const end=Date.now()-30000; // allow indexing delay for live
 const start=end-15*60*1000;
 const report={mint,mode:historical?"historical":"live",windowUTC:historical?
   ["2026-10-05T00:00:00Z","2026-10-06T00:00:00Z"]:
   [new Date(start).toISOString(),new Date(end).toISOString()],status:"not_run"};
 try {
  const response=await fetch("https://streaming.bitquery.io/graphql",{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
   body:JSON.stringify({query,variables:{mint,since:report.windowUTC[0],before:report.windowUTC[1]}}),
   signal:AbortSignal.timeout(30000)
  });
  const body=await response.json();
  report.httpStatus=response.status;
  report.errors=body.errors?.map(e=>({message:e.message}))||[];
  report.status=!response.ok||report.errors.length?"failed":"ok";
  report.sampleTrades=(body.data?.Solana?.DEXTradeByTokens||[]).map(t=>({
   time:t.Block?.Time,signature:t.Transaction?.Signature,signer:t.Transaction?.Signer,
   side:t.Trade?.Side?.Type,quoteMint:t.Trade?.Side?.Currency?.MintAddress
  }));
  report.count=report.sampleTrades.length;
 } catch(e){report.status="failed";report.errors=[{message:e.message}];}
 fs.writeFileSync("bitquery-probe.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,httpStatus:report.httpStatus,count:report.count,
  errors:report.errors},null,2));
 if(report.status!=="ok")process.exitCode=1;
}
main();
