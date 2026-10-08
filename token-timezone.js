// Token creation-time lookup: no mint transaction-history pagination, no Helius credits.
// Use: MINT=... DISPLAY_TIME=2026-10-05T08:21 HOLD_MINUTES=1 node token-timezone.js
const fs = require("node:fs");
const mint = (process.env.MINT || "").trim();
const shown = (process.env.DISPLAY_TIME || "").trim();
const hold = Number(process.env.HOLD_MINUTES ?? 0);
if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shown) ||
    !Number.isFinite(hold) || hold < 0) {
  throw Error("Provide valid MINT, DISPLAY_TIME=YYYY-MM-DDTHH:MM and HOLD_MINUTES>=0");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, {headers:{accept:"application/json"}, signal:AbortSignal.timeout(12000)});
    if (r.status === 429 || r.status >= 500) {
      if (i === 2) throw Error("HTTP " + r.status);
      await sleep(1500 * (i + 1)); continue;
    }
    if (!r.ok) throw Error("HTTP " + r.status);
    return r.json();
  }
}
function epoch(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  if (typeof value === "string") {
    const t = Date.parse(value); return Number.isFinite(t) ? t : null;
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 1e11 ? value * 1000 : value;
}
async function lookup() {
  const attempts = [];
  // Pump.fun token metadata creation timestamp is more relevant than a DEX pair timestamp.
  for (const url of [
    "https://frontend-api-v3.pump.fun/coins/" + mint,
    "https://frontend-api.pump.fun/coins/" + mint
  ]) {
    try {
      const item = await json(url);
      if (!item || (item.mint && item.mint !== mint)) throw Error("Unexpected mint in response");
      const ts = epoch(item.created_timestamp ?? item.createdTimestamp);
      if (ts) return {source:"pumpfun-coin-created_timestamp", timestampMs:ts,
        verifiedOnChain:false, attempts};
      attempts.push({source:url, issue:"No created_timestamp"});
    } catch(e) {attempts.push({source:url, issue:e.message});}
  }
  // DexScreener pairCreatedAt is *not* token launch time, and is NOT used to rule out timezones.
  try {
    const pairs = await json("https://api.dexscreener.com/token-pairs/v1/solana/" + mint);
    const times = (Array.isArray(pairs) ? pairs : [])
      .filter(p => p?.baseToken?.address === mint || p?.quoteToken?.address === mint)
      .map(p => ({ts:epoch(p.pairCreatedAt),dex:p.dexId,pair:p.pairAddress}))
      .filter(p => p.ts).sort((a,b) => a.ts - b.ts);
    if (times.length) return {source:"dexscreener-earliest-pair-created", timestampMs:times[0].ts,
      verifiedOnChain:false, proxyOnly:true, pair:times[0], attempts};
  } catch(e) {attempts.push({source:"dexscreener",issue:e.message});}
  return {source:"unavailable",timestampMs:null,attempts};
}
async function main() {
  const result = await lookup();
  const [y,mo,d,h,mi] = shown.match(/\d+/g).map(Number);
  const localAsUtc = Date.UTC(y,mo-1,d,h,mi);
  if (!Number.isFinite(localAsUtc) || new Date(localAsUtc).toISOString().slice(0,16) !== shown)
    throw Error("Invalid DISPLAY_TIME date");
  const offsets = [{name:"UTC",h:0},{name:"Philippines UTC+8",h:8},
    {name:"US Eastern EDT UTC-4",h:-4},{name:"London BST UTC+1",h:1}];
  const candidates = offsets.map(z => {
    const event = localAsUtc - z.h * 3600000;
    const age = result.timestampMs === null ? null : (event-result.timestampMs)/60000;
    return {timezone:z.name,eventUtc:new Date(event).toISOString(),
      minutesAfterReference:age === null ? null : Number(age.toFixed(2)),
      estimatedEntryAgeIfDateIsExit:age === null ? null : Number((age-hold).toFixed(2)),
      impossibleIfDateIsEntry:age === null || result.proxyOnly ? null : age < 0,
      impossibleIfDateIsExit:age === null || result.proxyOnly ? null : age-hold < 0};
  });
  const report = {mint,displayTime:shown,holdMinutes:hold,
    referenceSource:result.source,
    referenceTimeUtc:result.timestampMs === null ? null : new Date(result.timestampMs).toISOString(),
    onChainVerified:false,
    referenceIsOnlyPairCreation:!!result.proxyOnly,
    warning:result.proxyOnly ?
      "Pair creation is not token creation. Do not exclude a timezone using these comparisons." :
      result.timestampMs === null ?
      "No reliable token creation timestamp found from public endpoints." :
      "Pump.fun metadata timestamp found; verify against creation signature before treating it as definitive.",
    lookupIssues:result.attempts, candidates};
  fs.writeFileSync("token-timezone-results.json",JSON.stringify(report,null,2));
  console.log("Reference:",report.referenceSource,report.referenceTimeUtc);
  console.table(candidates);
  console.log(report.warning);
}
main().catch(e => {console.error(e);process.exitCode=1;});
