const fs = require("fs");

const key = process.env.HELIUS_API_KEY;
if (!key) throw new Error("Missing HELIUS_API_KEY");

const candidates = JSON.parse(
  fs.readFileSync("ember-reverse-candidates.json", "utf8")
);
const mints = [...new Set(candidates.map(x => x.mint).filter(Boolean))];
const metadata = new Map();
const BATCH_SIZE = 20;
const DELAY_MS = 1500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getBatch(ids) {
  const url = "https://mainnet.helius-rpc.com/?api-key=" + key;
  for (let attempt = 0; attempt < 12; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "ember-metadata",
          method: "getAssetBatch",
          params: { ids, displayOptions: { showFungible: true } }
        })
      });
    } catch (error) {
      const delay = Math.min(2000 * 2 ** attempt, 90000);
      console.warn("Network error:", error.message, "waiting", delay, "ms");
      await sleep(delay);
      continue;
    }

    if ([429, 500, 502, 503, 504].includes(response.status)) {
      const body = (await response.text()).slice(0, 400);
      const retryHeader = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryHeader) && retryHeader > 0
        ? retryHeader * 1000
        : Math.min(2000 * 2 ** attempt, 90000);
      console.warn("Helius HTTP", response.status, body, "- retrying after", delay, "ms");
      await sleep(delay);
      continue;
    }

    const text = await response.text();
    if (!response.ok) throw new Error("Helius HTTP " + response.status + ": " + text.slice(0, 800));

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("Invalid Helius JSON response: " + text.slice(0, 300)); }

    if (data.error) throw new Error("Helius RPC error: " + JSON.stringify(data.error));
    if (!Array.isArray(data.result)) throw new Error("Unexpected getAssetBatch response");
    return data.result;
  }
  throw new Error("Metadata request retries exhausted (see preceding HTTP status messages)");
}

function save() {
  const enriched = candidates.map(c => ({
    ...c,
    name: metadata.get(c.mint)?.name || "",
    symbol: metadata.get(c.mint)?.symbol || ""
  }));
  const matches = enriched.filter(x => /ember/i.test(x.name + " " + x.symbol));
  fs.writeFileSync("ember-identified.json", JSON.stringify(enriched, null, 2));
  fs.writeFileSync("ember-name-matches.json", JSON.stringify(matches, null, 2));
  fs.writeFileSync("ember-metadata-progress.json", JSON.stringify({
    candidateCount: candidates.length,
    uniqueMints: mints.length,
    processedMints: metadata.size,
    emberMatches: matches.length
  }, null, 2));
  return matches;
}

async function main() {
  // Always produce uploadable files, even if the first request fails.
  save();
  let processed = 0;
  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    const batch = mints.slice(i, i + BATCH_SIZE);
    console.log("Identifying mints", i + 1, "through", i + batch.length, "of", mints.length);
    const assets = await getBatch(batch);
    for (const id of batch) {
      const asset = assets.find(a => a?.id === id);
      metadata.set(id, {
        name: asset?.content?.metadata?.name || "",
        symbol: asset?.content?.metadata?.symbol || asset?.token_info?.symbol || ""
      });
    }
    processed += batch.length;
    const matches = save();
    console.log("Processed:", processed, "EMBER-name candidates:", matches.length);
    await sleep(DELAY_MS);
  }
  const matches = save();
  console.log("Complete. Mints:", mints.length, "EMBER-name candidates:", matches.length);
  console.table(matches.slice(0, 30).map(x => ({
    wallet: x.wallet.slice(0, 10), name: x.name, symbol: x.symbol,
    sol: x.sol, date: x.datePHT
  })));
}

main().catch(error => {
  save();
  console.error(error);
  process.exitCode = 1;
});