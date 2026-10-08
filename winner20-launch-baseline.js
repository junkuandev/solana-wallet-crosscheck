const fs=require('node:fs');
const {Client}=require('@solana-tracker/data-api');
const api=new Client({apiKey:process.env.SOLANA_TRACKER_API_KEY});
const mints=["DGNHqQS2buSPcNzZDhDkzUfpMe6syWzb8hrjv9yJqUQc","AHmD5jaFKqWMGswNkTSwAfvaWNHVY8m6JJro9LFppump","BLXhcFAtJpCM3HCbdzvr8F3JwGqdMGkAoLXuRmXLpump","Ca5VuKu5NyyFkixnewTnokmzXpmNuG8Mk5odwHJypRNq","2bN9YoTKiejNonS4Q1EjhypvRfndZLEiYJZUHLwYpump","9LhsAaiiK5tnKrUFJ76ygNWaCA5YNYmzExwQf2C7pump","AW1uyuM7hxzwqBoes88BbWKJPF3Sg7Kbu3TqR42spump","FaKnSu727DbTLsr3nWvKNdHJJJAmrgu8xJA1nU7CyX9B","4g2ToCkuFSBdW8GTJWMgnL7hGH2b2G2WkxgmS87Rpump","D6EuxSLN2ooDQLQGGTMC1H2oqjjVR7NGZWcq9Krhpump","6UCR8nmHZGauct3tKfismdYuLFemB6iMtuKEGycq7wCX","6x36m5J2VxRPpWBV3MEZq15oe5Tq8ahR7qSCdA7pump","8sdmTaNSm6atoV5k9roELHagfkGJhezDuqnwcewTpump","2XauZLfyEtqCwFjeegbaJpnXexA86vmefpx8R4W5pump","9LEvAa1sSfm98u2Z3Rn96MXbMmmmvoMqrsgAiARJpump","D2GbC5MyuR9H5RLg3JZJJygHg8AdnetjtfaFvv3zpump","41MjNbWHZeFmxwMHPwTfsJP3aPbvsvR5tsgnmhNKpump","5i21UkuLPaTiCqrSrF7vs6KEo1Vb1T1RWC5tdrbmpump","Fa7yZLtXLZ5sE77gfjEHodcL4pXHcRWWqqztMy1Lpump","7thxAzq4B9KwPe4NqMNAntF2Njgqb9FTKQb4z6fYpump"];
const out={dataset:'20 user-identified profitable Solana launches',assumption:'User classified these as profitable examples; no independent realized-profit verification',generatedAt:new Date().toISOString(),tokens:[],guidance:'Current tokenInfo MUST NOT be used as historic entry-time filters. Chart 1m candles only support exploratory market-cap ranges. Early candle can be after true launch and may miss initial pump.'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function query(f){for(let i=0;i<3;i++)try{return {data:await f(),error:null};}catch(e){let msg=String(e.message||e);if(i===2||!/429|rate.limit|too many/i.test(msg))return {data:null,error:msg};await pause(45000*(i+1));}}
function candlesOf(data){
 const items=Array.isArray(data)?data:Array.isArray(data?.oclhv)?data.oclhv:Array.isArray(data?.ohlcv)?data.ohlcv:Array.isArray(data?.candles)?data.candles:Array.isArray(data?.data)?data.data: data?.data?.oclhv||data?.data?.ohlcv||[];
 return Array.isArray(items)?items:[];
}
function stamp(c){let t=c.time??c.timestamp??c.t??c.startTime;return typeof t==='string'&&isNaN(Number(t))?Date.parse(t):Number(t)<1e11?Number(t)*1000:Number(t);}
function value(c){return Number(c.close??c.c??c.marketCap??c.marketcap);}
function stat(values){values=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)return null;return {min:values[0],median:values[Math.floor((values.length-1)*.5)],max:values.at(-1)};}
function csvRow(parts){return parts.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',');}
async function main(){
 if(!process.env.SOLANA_TRACKER_API_KEY)throw Error('Set SOLANA_TRACKER_API_KEY GitHub secret.');
 for(const mint of mints){
  const info=await query(()=>api.getTokenInfo(mint));
  await pause(1000);
  const chart=await query(()=>api.getChartData({tokenAddress:mint,type:'1m',marketCap:true,removeOutliers:false,dynamicPools:true}));
  let candles=candlesOf(chart.data).map(c=>({t:stamp(c),v:value(c)})).filter(c=>Number.isFinite(c.t)&&Number.isFinite(c.v)&&c.v>0).sort((a,b)=>a.t-b.t);
  const first=candles[0]?.t;
  const samples=[1,3,5,10].map(min=>({minute:min,marketCapUsd:first==null?null:candles.find(c=>c.t>=first+min*60000)?.v??null}));
  const range=stat(candles.filter(c=>first!=null&&c.t<=first+10*60000).map(c=>c.v));
  const tokenInfo=info.data;
  out.tokens.push({mint,infoError:info.error,chartError:chart.error,
   name:tokenInfo?.token?.name||null,symbol:tokenInfo?.token?.symbol||null,
   tokenInfoAsOf:new Date().toISOString(),currentOnlyTokenInfo:tokenInfo,
   historical:{firstAvailableCandleUTC:first?new Date(first).toISOString():null,candleCount:candles.length,earlyTenMinuteMarketCapUsd:range,samples,
     important:'Candle start time is NOT a verified token creation or signal time. Other Alpha Gardeners historical fields remain UNAVAILABLE.'},
   chartResponseShape:chart.data?Object.keys(chart.data).slice(0,15):null,
   chartFirst3Rows:candles.slice(0,3)});
  fs.writeFileSync('winner20-launch-baseline.json',JSON.stringify(out,null,2));
  console.log(out.tokens.length,mint,'candles',candles.length,'first',out.tokens.at(-1).historical.firstAvailableCandleUTC,'errors',info.error||chart.error||'none');
  await pause(1500);
 }
 const rows=[['mint','name','symbol','first_candle_utc','mcap_1m','mcap_3m','mcap_5m','mcap_10m','early_mcap_min','early_mcap_median','early_mcap_max','info_error','chart_error']];
 for(const t of out.tokens){let h=t.historical;rows.push([t.mint,t.name,t.symbol,h.firstAvailableCandleUTC,...h.samples.map(x=>x.marketCapUsd),h.earlyTenMinuteMarketCapUsd?.min,h.earlyTenMinuteMarketCapUsd?.median,h.earlyTenMinuteMarketCapUsd?.max,t.infoError,t.chartError]);}
 fs.writeFileSync('winner20-launch-baseline.csv',rows.map(csvRow).join('\n'));
 const vals=out.tokens.map(x=>x.historical.earlyTenMinuteMarketCapUsd?.median).filter(Number.isFinite);
 const summary={tokensProvided:mints.length,tokensProcessed:out.tokens.length,withUsableHistoricalMarketCap:vals.length,earlyMedianMarketCapDistribution:stat(vals),missingHistoricAlphaGardenersFields:['AG Score','Bundled %','Dev Hold %','Top Holders %','Buy Ratio %','FER','TTC','Smart Wallets','Token Age at signal','Signal-time liquidity'],presetRecommendation:'Do not set filters until verified signal-time values are available; CSV is observational, not a backtested preset'};
 fs.writeFileSync('winner20-filter-assessment.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
