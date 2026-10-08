// Compare screenshot-local timestamps with the earliest retrievable mint-address transaction.
// Usage: MINT=... DISPLAY_TIME=2026-10-05T08:21 HOLD_MINUTES=1 node token-timezone.js
const fs = require("node:fs");
const mint = process.env.MINT?.trim();
const shown = process.env.DISPLAY_TIME?.trim();
const hold = Number(process.env.HOLD_MINUTES || 0);
const key = process.env.HELIUS_API_KEY;
const maxPages = Math.min(100, Math.max(1, Number(process.env.MAX_PAGES || 30)));
if (!key || !mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(shown) ||
    !Number.isFinite(hold) || hold < 0) {
  throw Error("Set HELIUS_API_KEY, valid MINT, DISPLAY_TIME=YYYY-MM-DDTHH:MM, HOLD_MINUTES>=0");
}
const endpoint = "https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(key);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rpc(method, params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})
      });
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get("retry-after"));
        const delay = Number.isFinite(retry) && retry > 0 ?
          Math.min(retry * 1000, 90000) : Math.min(2000 * 2 ** attempt, 90000);
        console.warn(method, "HTTP", res.status, "retrying in", delay, "ms");
        await sleep(delay);
        continue;
      }
      if (!res.ok) throw Error(method + " HTTP " + res.status + ": " + (await res.text()).slice(0, 250));
      const body = await res.json();
      if (body.error) {
        if (body.error.code === 429 || body.error.code === -32429) {
          await sleep(Math.min(2000 * 2 ** attempt, 90000));
          continue;
        }
        throw Error(method + ": " + JSON.stringify(body.error));
      }
      return body.result;
    } catch (e) {
      if (attempt === 5 || !/fetch failed|network|timeout/i.test(String(e))) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw Error(method + " rate-limited after retries");
}
async function main() {
  let before, oldest, pages = 0, exhausted = false, total = 0;
  for (; pages < maxPages; pages++) {
    const opts = {limit: 1000};
    if (before) opts.before = before;
    const batch = await rpc("getSignaturesForAddress", [mint, opts]);
    if (!Array.isArray(batch)) throw Error("Unexpected signatures response");
    total += batch.length;
    if (batch.length) {
      oldest = batch[batch.length - 1];
      before = oldest.signature;
    }
    console.log("Page", pages + 1, "records", batch.length,
      "oldest UTC", oldest?.blockTime ? new Date(oldest.blockTime * 1000).toISOString() : "unknown");
    if (batch.length < 1000) {exhausted = true; pages++; break;}
    await sleep(250);
  }
  const knownTime = oldest?.blockTime;
  if (!knownTime) throw Error("No timestamp found. Check the mint address or RPC history coverage.");
  const offsets = [
    {zone:"UTC", hours:0}, {zone:"Philippines (UTC+8)", hours:8},
    {zone:"US Eastern (EDT, Oct 5)", hours:-4}, {zone:"London (BST, Oct 5)", hours:1}
  ];
  const [year, month, day, hour, minute] = shown.match(/\d+/g).map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute) / 1000;
  const results = offsets.map(({zone,hours}) => {
    const displayedUtc = naiveUtc - hours * 3600;
    const ageMinutes = (displayedUtc - knownTime) / 60;
    return {
      timezone:zone, displayedEventUTC:new Date(displayedUtc * 1000).toISOString(),
      earliestObservedMintTxUTC:new Date(knownTime * 1000).toISOString(),
      minutesSinceEarliestObservedTx:Math.round(ageMinutes * 10) / 10,
      ifDateIsEntry: {ageMinutes:Math.round(ageMinutes * 10) / 10,
        beforeEarliestObservedTx:ageMinutes < 0},
      ifDateIsExit: {estimatedEntryAgeMinutes:Math.round((ageMinutes - hold) * 10) / 10,
        beforeEarliestObservedTx:ageMinutes - hold < 0}
    };
  });
  const report = {
    mint, shown, holdMinutes:hold, scannedPages:pages, signaturesSeen:total,
    historyExhausted:exhausted, earliestObservedSignature:oldest.signature,
    earliestObservedBlockTimeUTC:new Date(knownTime * 1000).toISOString(),
    warning:exhausted ?
      "Earliest mint-address transaction found, but it is NOT proof of token launch. Verify the mint initialization transaction." :
      "History scan hit MAX_PAGES. Earliest observed timestamp is NOT the launch time; no timezone can be excluded on this evidence.",
    note:"Displayed timestamp may mean entry, exit, or alert. PNL is not needed for timezone testing. Rounding may cause minute-level differences.",
    results
  };
  fs.writeFileSync("token-timezone-results.json", JSON.stringify(report, null, 2));
  console.table(results.map(x => ({
    zone:x.timezone, eventUTC:x.displayedEventUTC,
    ageMin:x.minutesSinceEarliestObservedTx,
    entryIfExitAgeMin:x.ifDateIsExit.estimatedEntryAgeMinutes
  })));
  console.log(report.warning);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
