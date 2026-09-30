
const fs = require("fs");

const key = process.env.HELIUS_API_KEY;
if (!key) throw new Error("Missing HELIUS_API_KEY");

const candidates = JSON.parse(
  fs.readFileSync("ember-reverse-candidates.json", "utf8")
);

const mints = [...new Set(candidates.map(x => x.mint))];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function getBatch(ids) {
  const url = `https://mainnet.helius-rpc.com/?api-key=${key}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ember-metadata",
        method: "getAssetBatch",
        params: {
          ids,
          displayOptions: { showFungible: true }
        }
      })
    });

    if ([429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(Math.min(2000 * 2 ** attempt, 60000));
      continue;
    }

    if (!response.ok) {
      throw Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.error) throw Error(JSON.stringify(data.error));
    if (!Array.isArray(data.result)) {
      throw Error("Unexpected getAssetBatch response");
    }

    return data.result;
  }

  throw Error("Metadata request retries exhausted");
}

async function main() {
  const metadata = new Map();

  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    console.log(`Identifying tokens ${i + 1}-${i + batch.length}`);

    const assets = await getBatch(batch);

    for (const asset of assets) {
      if (!asset?.id) continue;

      metadata.set(asset.id, {
        name: asset.content?.metadata?.name || "",
        symbol:
          asset.content?.metadata?.symbol ||
          asset.token_info?.symbol ||
          ""
      });
    }

    await sleep(350);
  }

  const enriched = candidates.map(c => ({
    ...c,
    name: metadata.get(c.mint)?.name || "",
    symbol: metadata.get(c.mint)?.symbol || ""
  }));

  const emberMatches = enriched.filter(x =>
    /ember/i.test(`${x.name} ${x.symbol}`)
  );

  fs.writeFileSync(
    "ember-identified.json",
    JSON.stringify(enriched, null, 2)
  );

  fs.writeFileSync(
    "ember-name-matches.json",
    JSON.stringify(emberMatches, null, 2)
  );

  console.log(`Unique token mints: ${mints.length}`);
  console.log(`EMBER name matches: ${emberMatches.length}`);
  console.table(emberMatches.map(x => ({
    wallet: x.wallet.slice(0, 10),
    name: x.name,
    symbol: x.symbol,
    sol: x.sol,
    date: x.datePHT
  })));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
