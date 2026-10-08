// Candidate wallets by preset: timestamp-filtered Solscan DEX swaps, not mint-wide RPC pagination.
// Requires SOLSCAN_API_KEY secret. Names/prefixes from screenshot used ONLY for discovery.
const fs=require("node:fs");
const TOKEN=[
 {name:"Charizard Strategy",hint:"64hJ",shown:"2026-10-05T08:47",hold:9,pnl:-69.1},
 {name:"Fomi Ai",hint:"J2P3Y",shown:"2026-10-05T09:05",hold:9,pnl:118.6}
];
const KEY=process.env.SOLSCAN_API_KEY;
if(!KEY)throw Error("SOLSCAN_API_KEY GitHub Actions secret is required for historical swap data");
const known={0:(process.env.CHARIZARD_MINT||"").trim(),1:(process.env.FOMI_MINT||"").trim()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,auth=false) {
 for(let retry=0;retry<4;retry++){
  const r=await fetch(url,{headers:auth?{token:KEY,accept:"application/json"}:{accept:"application/json"},signal:AbortSignal.timeout(20000)});
  if(r.status===429||r.status>=500){if(retry===3)throw Error("HTTP "+r.status);await sleep(1800*2**retry);continue;}
  if(!r.ok)throw Error("HTTP "+r.status+" "+url.split("?")[0]);
  const json=await r.json();
  if(auth&&json.success!==true)throw Error("Solscan returned unsuccessful response "+JSON.stringify(json.errors||{}));
  return json;
 }
}
async function resolve(t,i){
 if(known[i]){
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(known[i]))throw Error("Invalid provided mint");
  return {mint:known[i],source:"provided"};
 }
 const q=encodeURIComponent(t.name);
 const data=await request("https://api.dexscreener.com/latest/dex/search?q="+q);
 const unique=new Map();
 for(const p of data.pairs||[]){
  if(p.chainId!=="solana")continue;
  for(const tok of [p.baseToken,p.quoteToken]){
   if(tok?.address?.startsWith(t.hint)&&tok.address.endsWith("pump"))
    unique.set(tok.address,{mint:tok.address,name:tok.name,symbol:tok.symbol});
  }
 }
 if(unique.size===1)return {...[...unique.values()][0],source:"dexscreener"};
 throw Error("Cannot uniquely resolve "+t.name+" from prefix. Matches="+JSON.stringify([...unique.values()])+"; set full mint workflow input");
}
function minute(s){return Date.parse(s+"+04:00")/1000}
const WSOL="So11111111111111111111111111111111111111112";
function leg(r,mint){
 const a=r.routers;
 if(!a||!a.token1||!a.token2)return null;
 if(![a.token1,a.token2].includes(mint))return null;
 const tokenIs1=a.token1===mint;
 const tokenQty=Number(tokenIs1?a.amount1:a.amount2)/10**Number(tokenIs1?a.token1_decimals:a.token2_decimals);
 const otherMint=tokenIs1?a.token2:a.token1;
 const otherQty=Number(tokenIs1?a.amount2:a.amount1)/10**Number(tokenIs1?a.token2_decimals:a.token1_decimals);
 if(!Number.isFinite(tokenQty)||!Number.isFinite(otherQty)||tokenQty<=0||otherQty<=0)return null;
 return {dir:tokenIs1?"sell":"buy",tokenQty,otherMint,otherQty};
}
async function fetchSwaps(mint,from,to){
 const rows=[],maxPages=10;
 let truncated=false;
 for(let page=1;page<=maxPages;page++){
  const q=new URLSearchParams({address:mint,from_time:String(from),to_time:String(to),
   page:String(page),page_size:"100",sort_by:"block_time",sort_order:"asc"});
  q.append("activity_type[]","ACTIVITY_TOKEN_SWAP");
  q.append("activity_type[]","ACTIVITY_AGG_TOKEN_SWAP");
  const data=await request("https://pro-api.solscan.io/v2.0/token/defi/activities?"+q,true);
  const batch=Array.isArray(data.data)?data.data:[];
  rows.push(...batch);
  if(batch.length<100)return {rows,truncated:false,pages:page};
  await sleep(450);
  if(page===maxPages)truncated=true;
 }
 return {rows,truncated,pages:maxPages};
}
async function main(){
 const out={preset:"vol-tight",timezoneAssumption:"UTC+4",dateAssumption:"entry minute",tokens:[],rankedWallets:[],
  caveat:"These are observed DEX swap candidates, not verified preset executions. PNL is approximate, only directly SOL-quoted single-leg swaps are comparable; fees and partial sells are excluded."};
 for(let i=0;i<TOKEN.length;i++){
  const t=TOKEN[i],entry=minute(t.shown),start=entry-120,end=entry+(t.hold+3)*60;
  const item={...t,entryUTC:new Date(entry*1000).toISOString(),candidateWallets:[],errors:[]};
  out.tokens.push(item);
  try{
   const addr=await resolve(t,i);item.mint=addr.mint;item.discovery=addr.source;
   const fetched=await fetchSwaps(addr.mint,start,end);
   item.records=fetched.rows.length;item.truncated=fetched.truncated;
   const wallets=new Map();
   for(const a of fetched.rows){
    const wallet=a.from_address,trade=leg(a,addr.mint);
    if(!wallet||!trade||!a.block_time||!a.trans_id)continue;
    const x=wallets.get(wallet)||[];x.push({time:a.block_time,signature:a.trans_id,...trade});wallets.set(wallet,x);
   }
   for(const [wallet,swaps] of wallets){
    const buys=swaps.filter(s=>s.dir==="buy"&&Math.abs(s.time-entry)<=120);
    const sells=swaps.filter(s=>s.dir==="sell");
    for(const buy of buys)for(const sell of sells){
     if(sell.time<=buy.time||Math.abs((sell.time-buy.time)/60-t.hold)>2)continue;
     let estimatedPnl=null;
     if(buy.otherMint===WSOL&&sell.otherMint===WSOL&&Math.abs(sell.tokenQty/buy.tokenQty-1)<0.15)
      estimatedPnl=(sell.otherQty/buy.otherQty-1)*100;
     item.candidateWallets.push({wallet,buy:new Date(buy.time*1000).toISOString(),
      sell:new Date(sell.time*1000).toISOString(),holdMinutes:(sell.time-buy.time)/60,
      pnlEstimatedPct:estimatedPnl===null?null:Number(estimatedPnl.toFixed(1)),
      pnlDeviationPct:estimatedPnl===null?null:Number(Math.abs(estimatedPnl-t.pnl).toFixed(1)),
      buySignature:buy.signature,sellSignature:sell.signature});
    }
   }
   item.candidateWallets.sort((a,b)=>(a.pnlDeviationPct??1e6)-(b.pnlDeviationPct??1e6));
   item.candidateWallets=item.candidateWallets.slice(0,100);
  }catch(e){item.errors.push(e.message);}
 }
 const hit=new Map();
 for(const t of out.tokens)for(const row of t.candidateWallets){
  const a=hit.get(row.wallet)||{wallet:row.wallet,tokens:[],pnlDeviationTotal:0};
  if(!a.tokens.includes(t.name)){a.tokens.push(t.name);a.pnlDeviationTotal+=row.pnlDeviationPct??1000;}
  hit.set(row.wallet,a);
 }
 out.rankedWallets=[...hit.values()].sort((a,b)=>b.tokens.length-a.tokens.length||a.pnlDeviationTotal-b.pnlDeviationTotal).slice(0,100);
 fs.writeFileSync("preset-wallet-candidates.json",JSON.stringify(out,null,2));
 console.log("Token results:",out.tokens.map(t=>({name:t.name,mint:t.mint,records:t.records,truncated:t.truncated,candidates:t.candidateWallets.length,errors:t.errors})));
 console.log("Cross-token candidate wallets:",out.rankedWallets.filter(x=>x.tokens.length>1).length);
 if(out.tokens.some(t=>t.truncated))console.warn("WARNING: Page cap hit; results incomplete.");
 if(out.tokens.some(t=>t.errors.length))console.warn("WARNING: Some tokens failed discovery or retrieval. See artifact.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
