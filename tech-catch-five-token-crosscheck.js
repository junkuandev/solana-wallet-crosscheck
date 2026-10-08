const fs=require('node:fs');
const {Client}=require('@solana-tracker/data-api');
const client=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
if(!process.env.SOLANA_TRACKER_API_KEY)throw Error('SOLANA_TRACKER_API_KEY missing');
const tokens=[
{name:'Pairstreet',mint:'6iQp3cxTYPKaHHRX3SnmuFisLdrr9DznDU6gKnQtpump',time:'2026-10-05T04:21:00Z',hold:1,pnl:172.4},
{name:'CurAI',mint:'i4veeVNKy1Knib97xaLMRsL3QnT48ixb5KS36ynpump',time:'2026-10-05T04:30:00Z',hold:27,pnl:-75.1},
{name:'Agent Dilbert',mint:'EsiESbrKygvpvsqC41WevAwYQtjjZEYDJHvJP5vDPLWU',time:'2026-10-05T04:32:00Z',hold:1,pnl:-63.0},
{name:'GitPad',mint:'LNuGWLCPb9DwKWc73AYLmuGM4cgaKccWGA4Y5Vvpump',time:'2026-10-05T10:06:00Z',hold:6,pnl:-94.2},
{name:'tikpad.fun',mint:'DTPJ9QS8gYoJ7Ka5t9WoQoj4D2dsyZmQfqYE4yrkpump',time:'2026-10-05T10:42:00Z',hold:6,pnl:688.1}
];
const M=60000, PAGE_CAP=8, LIMIT=500;
const out={method:'Discover common wallets with buy-side first; screenshot timestamps interpreted as entries in UTC+4; do not infer common wallets across presets',tokens,windows:[],candidateWallets:[],notes:['Windows that hit page cap are incomplete, absence does not rule a wallet out','Repeated token names and fee-adjusted PNL are not proof','tikpad.fun address was previously suggested but not supplied by user; verify mint manually']};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function scan(t){
const start=Date.parse(t.time)-2*M,end=Date.parse(t.time)+3*M;
let cursor=start,done=false,reason=null,last=null,requests=0;const trades=[],seen=new Set();
for(let i=0;i<PAGE_CAP;i++){
 let p=null;
 for(let retry=0;retry<3;retry++){
  try{p=await client.getTokenTradeHistory(t.mint,{events:'trades',sortDirection:'ASC',cursor,limit:LIMIT});requests++;break;}
  catch(e){requests++;let s=String(e.message||e);if(!/429|rate.limit|too many/i.test(s)||retry===2){reason=s;break;}await delay(45000*(retry+1));}
 }
 if(!p)break;
 for(const x of p.trades||[]){
  last=x.time;
  if(x.time>end){done=true;break;}
  if(x.time<start||x.type!=='buy'||!x.wallet)continue;
  const key=x.tx+'|'+x.wallet+'|'+x.time+'|'+x.amount;
  if(seen.has(key))continue;seen.add(key);
  trades.push({wallet:x.wallet,at:new Date(x.time).toISOString(),amount:x.amount,priceUsd:x.priceUsd,tx:x.tx});
 }
 if(done||!p.hasNextPage){done=true;break;}
 const next=Number(p.nextCursor);
 if(!Number.isFinite(next)||next<=cursor){reason='Cursor stalled';break;}
 if(i===PAGE_CAP-1){reason='Page cap';break;}
 cursor=next;
}
return {token:t.name,from:new Date(start).toISOString(),to:new Date(end).toISOString(),complete:done,reason,lastUTC:last?new Date(last).toISOString():null,requests,trades};
}
async function main(){
try{
 for(const t of tokens){const w=await scan(t);out.windows.push(w);fs.writeFileSync('tech-catch-five-token-crosscheck.json',JSON.stringify(out,null,2));console.log(t.name,w.trades.length,w.complete,w.reason||'');await delay(1500);}
 const all=new Map();
 for(const w of out.windows){const unique=new Set(w.trades.map(x=>x.wallet));for(const wallet of unique){const arr=all.get(wallet)||[];arr.push(w.token);all.set(wallet,arr);}}
 out.candidateWallets=[...all.entries()].filter(([_,matches])=>matches.length>=2).map(([wallet,matches])=>({wallet,tokensMatched:matches.length,tokens:matches,entryTrades:Object.fromEntries(out.windows.filter(w=>matches.includes(w.token)).map(w=>[w.token,w.trades.filter(x=>x.wallet===wallet)]))})).sort((a,b)=>b.tokensMatched-a.tokensMatched);
 out.summary={requests:out.windows.reduce((a,w)=>a+w.requests,0),windowsComplete:out.windows.filter(w=>w.complete).length,totalWindows:out.windows.length,walletsAtLeast2:out.candidateWallets.length,walletsAtLeast3:out.candidateWallets.filter(x=>x.tokensMatched>=3).length,walletsAtLeast4:out.candidateWallets.filter(x=>x.tokensMatched>=4).length,walletsAll5:out.candidateWallets.filter(x=>x.tokensMatched===5).length};
}finally{fs.writeFileSync('tech-catch-five-token-crosscheck.json',JSON.stringify(out,null,2));console.log(JSON.stringify({summary:out.summary,top:out.candidateWallets.slice(0,20).map(x=>({wallet:x.wallet,tokens:x.tokens}))},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
