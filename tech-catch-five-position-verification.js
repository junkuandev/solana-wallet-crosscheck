const fs=require('node:fs');
const {Client}=require('@solana-tracker/data-api');
const api=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const wallet='9nXMTkYdjApM5V6FbQsSftk1sqqLtFH8rehPt9Xbt2dL';
const tokens=[
{name:'Pairstreet',mint:'6iQp3cxTYPKaHHRX3SnmuFisLdrr9DznDU6gKnQtpump',entry:'2026-10-05T04:21:00Z',hold:1,pnl:172.4},
{name:'CurAI',mint:'i4veeVNKy1Knib97xaLMRsL3QnT48ixb5KS36ynpump',entry:'2026-10-05T04:30:00Z',hold:27,pnl:-75.1},
{name:'Agent Dilbert',mint:'EsiESbrKygvpvsqC41WevAwYQtjjZEYDJHvJP5vDPLWU',entry:'2026-10-05T04:32:00Z',hold:1,pnl:-63},
{name:'GitPad',mint:'LNuGWLCPb9DwKWc73AYLmuGM4cgaKccWGA4Y5Vvpump',entry:'2026-10-05T10:06:00Z',hold:6,pnl:-94.2},
{name:'tikpad.fun',mint:'DTPJ9QS8gYoJ7Ka5t9WoQoj4D2dsyZmQfqYE4yrkpump',entry:'2026-10-05T10:42:00Z',hold:6,pnl:688.1}
];
const out={wallet,positions:[],notes:['Price-derived PNL excludes priority fees and bot fees','Histories may contain multiple position cycles; compare executions and quantities','tikpad.fun mint is provisional and should be confirmed']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(t){
 const from=Date.parse(t.entry)-20*60000,to=Date.parse(t.entry)+(t.hold+40)*60000;
 let cursor=from,done=false,reason=null,reqs=0,trades=[],seen=new Set();
 for(let i=0;i<8;i++){
  let page;
  for(let attempt=0;attempt<3;attempt++){
   try{page=await api.getUserTokenTradeHistory(t.mint,wallet,{events:'trades',sortDirection:'ASC',cursor,limit:500});reqs++;break;}
   catch(e){reqs++;const msg=String(e.message||e);if(!/429|rate.limit|too many/i.test(msg)||attempt===2){reason=msg;break;}await sleep((attempt+1)*45000);}
  }
  if(!page)break;
  for(const x of page.trades||[]){
    if(x.time>to){done=true;break;}
    if(x.time<from||!['buy','sell'].includes(x.type))continue;
    const key=[x.tx,x.type,x.time,x.amount].join('|');
    if(seen.has(key))continue;seen.add(key);
    trades.push({type:x.type,time:x.time,utc:new Date(x.time).toISOString(),amount:x.amount,volumeUsd:x.volume,volumeSol:x.volumeSol,priceUsd:x.priceUsd,tx:x.tx});
  }
  if(done||!page.hasNextPage){done=true;break;}
  let next=Number(page.nextCursor);
  if(!Number.isFinite(next)||next<=cursor){reason='Stalled cursor';break;}
  if(i===7){reason='8-page cap';break;}
  cursor=next;
 }
 trades.sort((a,b)=>a.time-b.time);
 const buys=trades.filter(x=>x.type==='buy'),sells=trades.filter(x=>x.type==='sell');
 const qtyBuy=buys.reduce((s,x)=>s+x.amount,0),qtySell=sells.reduce((s,x)=>s+x.amount,0);
 const usdBuy=buys.reduce((s,x)=>s+x.amount*x.priceUsd,0),usdSell=sells.reduce((s,x)=>s+x.amount*x.priceUsd,0);
 return {name:t.name,mint:t.mint,targetPnlPct:t.pnl,targetHoldMinutes:t.hold,complete:done,reason,requests:reqs,firstBuyUTC:buys[0]?.utc,lastSellUTC:sells.at(-1)?.utc,minutesFirstBuyToLastSell:buys.length&&sells.length?+( (sells.at(-1).time-buys[0].time)/60000).toFixed(2):null,buys:buys.length,sells:sells.length,qtyBuy,qtySell,quantityClosureRatio:qtyBuy?qtySell/qtyBuy:null,buyUsd:usdBuy,sellUsd:usdSell,grossPnlPct:usdBuy?100*(usdSell/usdBuy-1):null,trades};
}
async function main(){try{for(const t of tokens){const p=await get(t);out.positions.push(p);fs.writeFileSync('tech-catch-five-position-verification.json',JSON.stringify(out,null,2));console.log(t.name,p.buys,p.sells,p.complete,p.grossPnlPct,p.minutesFirstBuyToLastSell);await sleep(1800);}}finally{fs.writeFileSync('tech-catch-five-position-verification.json',JSON.stringify(out,null,2));}}
main().catch(e=>{console.error(e);process.exitCode=1;});
