// Historical 15-30 second entry-window study. Do not use current metadata as entry-time data.
const fs=require('node:fs');
const {Client}=require('@solana-tracker/data-api');
const api=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const mints=["DGNHqQS2buSPcNzZDhDkzUfpMe6syWzb8hrjv9yJqUQc","AHmD5jaFKqWMGswNkTSwAfvaWNHVY8m6JJro9LFppump","BLXhcFAtJpCM3HCbdzvr8F3JwGqdMGkAoLXuRmXLpump","Ca5VuKu5NyyFkixnewTnokmzXpmNuG8Mk5odwHJypRNq","2bN9YoTKiejNonS4Q1EjhypvRfndZLEiYJZUHLwYpump","9LhsAaiiK5tnKrUFJ76ygNWaCA5YNYmzExwQf2C7pump","AW1uyuM7hxzwqBoes88BbWKJPF3Sg7Kbu3TqR42spump","FaKnSu727DbTLsr3nWvKNdHJJJAmrgu8xJA1nU7CyX9B","4g2ToCkuFSBdW8GTJWMgnL7hGH2b2G2WkxgmS87Rpump","D6EuxSLN2ooDQLQGGTMC1H2oqjjVR7NGZWcq9Krhpump","6UCR8nmHZGauct3tKfismdYuLFemB6iMtuKEGycq7wCX","6x36m5J2VxRPpWBV3MEZq15oe5Tq8ahR7qSCdA7pump","8sdmTaNSm6atoV5k9roELHagfkGJhezDuqnwcewTpump","2XauZLfyEtqCwFjeegbaJpnXexA86vmefpx8R4W5pump","9LEvAa1sSfm98u2Z3Rn96MXbMmmmvoMqrsgAiARJpump","D2GbC5MyuR9H5RLg3JZJJygHg8AdnetjtfaFvv3zpump","41MjNbWHZeFmxwMHPwTfsJP3aPbvsvR5tsgnmhNKpump","5i21UkuLPaTiCqrSrF7vs6KEo1Vb1T1RWC5tdrbmpump","Fa7yZLtXLZ5sE77gfjEHodcL4pXHcRWWqqztMy1Lpump","7thxAzq4B9KwPe4NqMNAntF2Njgqb9FTKQb4z6fYpump"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function safe(f){for(let i=0;i<3;i++)try{return {data:await f(),error:null};}catch(e){const msg=String(e.message||e);if(i===2||!/429|rate.limit|too many/i.test(msg))return {data:null,error:msg};await sleep(30000*(i+1));}}
function rows(x){if(Array.isArray(x))return x;for(const k of ['oclhv','ohlcv','candles','data']){if(Array.isArray(x?.[k]))return x[k];if(x?.[k]&&typeof x[k]==='object'){const r=rows(x[k]);if(r.length)return r;}}return [];}
function ms(x){if(typeof x==='string'&&!/^\d+$/.test(x))return Date.parse(x);const v=Number(x);return v<1e11?v*1000:v;}
function stat(v){v=v.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?{min:v[0],median:v[Math.floor((v.length-1)*.5)],max:v.at(-1)}:null;}
function value(r,k){return Number(r[k]??r[k==='c'?'close':'v']??NaN);}
function pick(candles,timeMs,creationMs){
 // For 5s candles assume timestamp marks bar open; only completed candles count.
 const candidates=candles.filter(c=>c.t>=creationMs-5000&&c.t+5000<=timeMs);
 return candidates.at(-1)||null;
}
function csv(a){return a.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',');}
async function main(){
 if(!process.env.SOLANA_TRACKER_API_KEY)throw Error('Missing SOLANA_TRACKER_API_KEY');
 const out={description:'Winner20 early-entry analysis anchored to reported token creation time',generatedAt:new Date().toISOString(),entryWindowSeconds:[15,20,25,30],caveats:['5-second OHLCV closing market caps are proxies, not executable buy quotes','Creation timestamp source and chart timestamp synchronization may differ','Only completed candles at or before each snapshot are used','Current holders, bundling, AG Score and other present-day metrics are never treated as historical','User selected winners, so candidate bounds cannot establish predictive power'],tokens:[]};
 for(const mint of mints){
  const info=await safe(()=>api.getTokenInfo(mint));await sleep(500);
  const created=Number(info.data?.token?.creation?.created_time);
  const ctime=Number.isFinite(created)&&created>1e9?created:null;
  const chart=ctime?await safe(()=>api.getChartData({tokenAddress:mint,type:'5s',timeFrom:ctime-10,timeTo:ctime+360,marketCap:true,removeOutliers:false,dynamicPools:true})): {data:null,error:'No valid token creation timestamp'};
  const data=rows(chart.data).map(r=>({t:ms(r.time??r.timestamp??r.t??r.startTime),c:value(r,'c'),o:Number(r.open??r.o),h:Number(r.high??r.h),l:Number(r.low??r.l),v:Number(r.volume??r.v)})).filter(r=>Number.isFinite(r.t)&&Number.isFinite(r.c)&&r.c>0).sort((a,b)=>a.t-b.t);
  const snapshots=[15,20,25,30].map(s=>{const candle=ctime?pick(data,(ctime+s)*1000,ctime*1000):null;return {ageSeconds:s,marketCapUsd:candle?.c??null,candleUTC:candle?new Date(candle.t).toISOString():null,lagSeconds:candle?(ctime+s)-candle.t/1000-5:null};});
  const after30=data.filter(c=>ctime&&c.t>=(ctime+30)*1000);
  const early=stat(snapshots.map(s=>s.marketCapUsd));
  const item={mint,symbol:info.data?.token?.symbol??null,name:info.data?.token?.name??null,creationTimeUTC:ctime?new Date(ctime*1000).toISOString():null,chartError:chart.error,infoError:info.error,candlesReturned:data.length,firstCandleUTC:data[0]?new Date(data[0].t).toISOString():null,firstCandleLagSeconds:data.length&&ctime?data[0].t/1000-ctime:null,snapshots,entryWindowMarketCapUsd:early,post30Minute6MaxObservedMcapUsd:after30.length?Math.max(...after30.map(c=>c.h).filter(Number.isFinite)):null,chartResponseShape:chart.data?Object.keys(chart.data):null};
  out.tokens.push(item);fs.writeFileSync('winner20-15-30s.json',JSON.stringify(out,null,2));
  console.log(mint,'candleCount',data.length,'15s',snapshots[0].marketCapUsd,'30s',snapshots.at(-1).marketCapUsd,chart.error||'');
  await sleep(1000);
 }
 const head=['mint','symbol','creation_utc','first_candle_lag_s','candles','mcap_15s','mcap_20s','mcap_25s','mcap_30s','observed_post30s_max_mcap','error'];
 const table=[head,...out.tokens.map(t=>[t.mint,t.symbol,t.creationTimeUTC,t.firstCandleLagSeconds,t.candlesReturned,...t.snapshots.map(s=>s.marketCapUsd),t.post30Minute6MaxObservedMcapUsd,t.chartError||t.infoError])];
 fs.writeFileSync('winner20-15-30s.csv',table.map(csv).join('\n'));
 const ready=out.tokens.filter(t=>t.snapshots.every(x=>x.marketCapUsd!==null));
 const summary={provided:mints.length,complete15to30:ready.length,missing:mints.length-ready.length,distribution:Object.fromEntries([15,20,25,30].map((s,i)=>[s,stat(ready.map(t=>t.snapshots[i].marketCapUsd))])),recommendation:'Treat as winner-only descriptive entry-window bounds. Do not select a final preset without contemporaneous risk/holder data and comparison with losers.'};
 fs.writeFileSync('winner20-15-30s-assessment.json',JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
