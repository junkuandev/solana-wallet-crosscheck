const fs = require("fs");

const candidates = JSON.parse(fs.readFileSync("ember-reverse-candidates.json", "utf8"));
const mints = [...new Set(candidates.map(c => c.mint).filter(Boolean))];
const metadata = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const batchSize = 25;

function save() {
  const identified = candidates.map(c => ({
    ...c,
    name: metadata.get(c.mint)?.name || "",
    symbol: metadata.get(c.mint)?.symbol || "",
    metadataFound: metadata.has(c.mint)
  }));
  const matches = identified.filter(c => /ember/i.test(c.name + " " + c.symbol));
  fs.writeFileSync("ember-identified.json", JSON.stringify(identified, null, 2));
  fs.writeFileSync("ember-name-matches.json", JSON.stringify(matches, null, 2));
  fs.writeFileSync("ember-identification-status.json", JSON.stringify({
    totalMints: mints.length, identifiedMints: metadata.size,
    missingMints: mints.filter(m => !metadata.has(m)),
    emberMatches: matches.length,
    note: "DexScreener lists tokens with indexed trading pairs; missing metadata does not exclude a token."
  }, null, 2));
}

async function getPairs(batch) {
  const url = "https://api.dexscreener.com/tokens/v1/solana/" + batch.join(",");
  for (let attempt = 0; attempt < 7; attempt++) {
    let response;
    try { response = await fetch(url, {headers: {"Accept":"application/json"}}); }
    catch (err) {
      const ms = Math.min(2000 * 2 ** attempt, 30000);
      console.warn("Network error:", err.message, "retry in", ms, "ms");
      await sleep(ms);
      continue;
    }
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      const ms = Math.min(2000 * 2 ** attempt, 30000);
      console.warn("DexScreener HTTP", response.status, "retry in", ms, "ms");
      await sleep(ms);
      continue;
    }
    if (!response.ok) throw Error("DexScreener HTTP " + response.status + ": " + (await response.text()).slice(0, 300));
    const data = await response.json();
    if (!Array.isArray(data)) throw Error("Unexpected DexScreener response");
    return data;
  }
  throw Error("DexScreener retries exhausted");
}

async function main() {
  save();
  for (let i = 0; i < mints.length; i += batchSize) {
    const batch = mints.slice(i, i + batchSize);
    const pairs = await getPairs(batch);
    const wanted = new Set(batch);
    for (const pair of pairs) {
      for (const token of [pair.baseToken, pair.quoteToken]) {
        if (token?.address && wanted.has(token.address) && !metadata.has(token.address)) {
          metadata.set(token.address, {
            name: token.name || "",
            symbol: token.symbol || ""
          });
        }
      }
    }
    save();
    console.log("Processed " + Math.min(i + batch.length, mints.length) + "/" + mints.length + " mints; " + metadata.size + " identified");
    await sleep(500);
  }
  const matches = candidates.filter(c => {
    const info = metadata.get(c.mint);
    return info && /ember/i.test((info.name || "") + " " + (info.symbol || ""));
  });
  console.log("EMBER name matches:", matches.length);
  console.table(matches.slice(0, 40).map(c => ({
    wallet: c.wallet.slice(0, 10),
    token: metadata.get(c.mint)?.name || "",
    symbol: metadata.get(c.mint)?.symbol || "",
    sol: c.sol, date: c.datePHT
  })));
}

main().catch(err => {
  save();
  console.error(err);
  process.exitCode = 1;
});