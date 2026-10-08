const fs=require("node:fs");
const {Client}=require("@solana-tracker/data-api");
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error("SOLANA_TRACKER_API_KEY missing");
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const tokens=[
 {name:"Charizard Strategy",mint:"64hJjjXBbqFdpMjgPvbUp1AA4bardkGEnEdDqFepccAX",stamp:"2026-10-05T04:47:00Z",hold:9,pnl:-69.1},
 {name:"Fomi Ai",mint:"J2P3YpQGVhkBN4vDD6r4qvigNicj7K21xm4iSS1rpump",stamp:"2026-10-05T05:05:00Z",hold:9,pnl:118.6}
];
const MIN=60000;
const windows=[];
for(const t of tokens){
 const s=Date.parse(t.stamp);
 // Entry interpretation: timestamp is approximately buy time.
 // Exit interpretation: timestamp is approximately sell time.
 for(const mode of ["entry","exit"]){
  const buyCenter=mode==="entry"?s:s-t.hold*MIN;
  const sellCenter=mode==="entry"?s+t.hold*MIN:s;
  windows.push({token:t.name,mint:t.mint,mode,side:"buy",start:buyCenter-2*MIN,end:buyCenter+3*MIN});
  windows.push({token:t.name,mint:t.mint,mode,side:"sell",start:sellCenter-3*MIN,end:sellCenter+3*MIN});
 }
}
const out={purpose:"Find one wallet trading Charizard and Fomi under vol-tight; independent preset wallets elsewhere",tokens,limits:{pagesPerWindow:3,limitPerPage:500},windows:[],walletMatches:[],warnings:[
 "This is a capped discovery scan, not an exhaustive transaction history. Missing candidate does not rule a wallet out.",
 "Timestamp interpretation and UTC+4 screenshot timezone are assumptions.",
 "PnL is a gross buy/sell estimate, without bot, priority or transaction fees. Multiple fills may require position reconstruction."
]};
async function fetchWindow(w){
 let cursor=w.start,done=false,reason=null;
 const trades=[],seen=new Set();let last=null,requests=0;
 for(let pageNo=0;pageNo<3;pageNo++){
  let p;
  for(let attempt=0;attempt<3;attempt++){
   try {p=await client.getTokenTradeHistory(w.mint,{events:"trades",sortDirection:"ASC",cursor,limit:500});requests++;break;}
   catch(e){requests++;const msg=String(e.message||e);
    if(!/rate.limit|429|too many/i.test(msg)||attempt===2){reason=msg;break;}
    await new Promise(r=>setTimeout(r,45000*(attempt+1)));
   }
  }
  if(!p)break;
  const rows=p.trades||[];
  for(const t of rows){
   if(!Number.isFinite(t.time))continue;last=t.time;
   if(t.time>w.end){done=true;break;}
   if(t.time<w.start||t.type!==w.side||!t.wallet)continue;
   const key=[t.tx,t.wallet,t.type,t.time,t.amount].join("|");
   if(seen.has(key))continue;seen.add(key);
   trades.push({wallet:t.wallet,type:t.type,time:t.time,amount:t.amount,priceUsd:t.priceUsd,tx:t.tx});
  }
  if(done||!p.hasNextPage){done=true;break;}
  const next=Number(p.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){reason="Non-advancing cursor";break;}
  if(pageNo===2){reason="3-page cap";break;}
  cursor=next;
 }
 return {token:w.token,mode:w.mode,side:w.side,from:new Date(w.start).toISOString(),to:new Date(w.end).toISOString(),complete:done,reason,requests,lastUTC:last?new Date(last).toISOString():null,trades};
}
function pairs(token,mode){
 const b=out.windows.find(w=>w.token===token.name&&w.mode===mode&&w.side==="buy");
 const s=out.windows.find(w=>w.token===token.name&&w.mode===mode&&w.side==="sell");
 if(!b||!s)return [];
 const sells=new Map();
 for(const x of s.trades){let r=sells.get(x.wallet)||[];r.push(x);sells.set(x.wallet,r);}
 const matched=new Map();
 for(const buy of b.trades)for(const sell of sells.get(buy.wallet)||[]){
  const hold=(sell.time-buy.time)/MIN;
  if(hold<=0||Math.abs(hold-token.hold)>3)continue;
  const ratio=sell.amount/buy.amount;
  if(!Number.isFinite(ratio)||Math.abs(1-ratio)>0.08)continue;
  const pnl=100*(sell.amount*sell.priceUsd/(buy.amount*buy.priceUsd)-1);
  if(!Number.isFinite(pnl))continue;
  const match={wallet:buy.wallet,mode,buyUTC:new Date(buy.time).toISOString(),
   sellUTC:new Date(sell.time).toISOString(),holdMinutes:+hold.toFixed(2),
   grossPnlPct:+pnl.toFixed(2),pnlDiff:+Math.abs(pnl-token.pnl).toFixed(2),
   buyTx:buy.tx,sellTx:sell.tx};
  const prev=matched.get(buy.wallet);
  const score=Math.abs(pnl-token.pnl)+Math.abs(hold-token.hold)*2;
  if(!prev||score<prev.score)matched.set(buy.wallet,{...match,score});
 }
 return [...matched.values()];
}
async function main(){
 try{
  for(const w of windows){
   const result=await fetchWindow(w);out.windows.push(result);
   fs.writeFileSync("vol-tight-two-token-overlap-v2.json",JSON.stringify(out,null,2));
   console.log(result.token,result.mode,result.side,result.trades.length,result.complete,result.reason||"");
   await new Promise(r=>setTimeout(r,1800));
  }
  const a=new Map(),b=new Map();
  for(const t of tokens){const map=t===tokens[0]?a:b;
   for(const mode of ["entry","exit"])for(const p of pairs(t,mode)){
    const prior=map.get(p.wallet);if(!prior||p.score<prior.score)map.set(p.wallet,p);
   }
  }
  for(const [wallet,c] of a){const f=b.get(wallet);if(!f)continue;
   out.walletMatches.push({wallet,combinedScore:+(c.score+f.score).toFixed(2),
    charizard:c,fomi:f});
  }
  out.walletMatches.sort((x,y)=>x.combinedScore-y.combinedScore);
  out.summary={requests:out.windows.reduce((n,w)=>n+w.requests,0),
    completeWindows:out.windows.filter(w=>w.complete).length,totalWindows:out.windows.length,
    charizardMatchedWallets:a.size,fomiMatchedWallets:b.size,matchedBoth:out.walletMatches.length};
 }finally{
  fs.writeFileSync("vol-tight-two-token-overlap-v2.json",JSON.stringify(out,null,2));
  console.log(JSON.stringify({summary:out.summary,top:out.walletMatches.slice(0,20)},null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
