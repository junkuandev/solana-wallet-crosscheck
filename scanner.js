
const fs = require("fs");

const API_KEY = process.env.HELIUS_API_KEY;
if (!API_KEY) throw new Error("Missing HELIUS_API_KEY");

const KEAINU = "2ekjqFvTt6Adu1QC5UEmxm2bfJSdqw8QThiSoJbqcJVM";
const WSOL = "So11111111111111111111111111111111111111112";

const wallets = [
  {
    wallet: "Finr5rgQ4B4oZxAfjpA61Cpw77ZJG73FHv9X8mqdZiL6",
    before: "4VqRx8nzT8Vv6vPgzSHyf3uwmkhDUYGp2Uu55y7CjnHCE5zf9Ys6knmNqid1gxMpG1tcPa53zVLv6UFVrdakQY6Y"
  },
  {
    wallet: "kEFiAX3jo5NmemysQov342TZ9mGh6yp92GDRjhA8XDf",
    before: "4jBipFtTafWFDK8xGED9jf14WfiCrNck7yQojQ9kD2M4WteJr58suokUcdWKbWgngJxRe76DTvAipATEBoEvqtQp"
  },
  {
    wallet: "AeBgCFnkSWMAwv3zjaJPB93hxEBUEVkhEyKVFaxT84pJ",
    before: "bWrmxzNVQk5ZqD2rb7i1TQboVpR1Af9ssN7YNQrdv6sKMgBibDEeTLKGxTf6e9div4r3ngojXPzWoCHd2p2Gveh"
  },
  {
    wallet: "DZbgq3yE3r41EFszV3XastvyS8j8QnmNT37nsq7sxR66",
    before: "5Q61nKCcdos8rPpG12j1atF7Cx3G4FvLHnR1fge31d3sL8Z6Rx32bHPxRFTpbjzTGaCQZZ668DRnFXEwfKab7qvN"
  },
  {
    wallet: "NULLioEUhd89Jo5Acm9sX88bwjNjrsAVy6KWkXD7qZh",
    before: "3fYANnb1vdKng8szzCJm9xZtzHS2BcRMic5QLABYJ1sLg8tAHPCf7a3xSbbpT4Ae4PYree993YubhCis2aLBn9Ro"
  }
];

const START = Date.parse("2026-09-18T00:00:00+08:00") / 1000;
const END = Date.parse("2026-09-19T13:15:00+08:00") / 1000;

const TARGET = 0.76;
const TOLERANCE = 0.16;
const MAX_PAGES = 3000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pht(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    hour12: true
  });
}

async function fetchPage(wallet, before) {
  const url = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );

  url.searchParams.set("api-key", API_KEY);
  url.searchParams.set("limit", "100");
  if (before) url.searchParams.set("before", before);

  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(url);

    if ([429, 500, 502, 503, 504].includes(response.status)) {
      const retry = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retry) && retry > 0
        ? retry * 1000
        : Math.min(2000 * 2 ** attempt, 60000);

      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  throw new Error("Request failed after retries");
}

function analyze(tx, wallet) {
  const transfers = tx.tokenTransfers || [];

  const tokenIn = transfers
    .filter(t => t.mint === KEAINU && t.toUserAccount === wallet)
    .reduce((sum, t) => sum + Number(t.tokenAmount || 0), 0);

  const tokenOut = transfers
    .filter(t => t.mint === KEAINU && t.fromUserAccount === wallet)
    .reduce((sum, t) => sum + Number(t.tokenAmount || 0), 0);

  const wsolOut = transfers
    .filter(t => t.mint === WSOL && t.fromUserAccount === wallet)
    .reduce((sum, t) => sum + Number(t.tokenAmount || 0), 0);

  const wsolIn = transfers
    .filter(t => t.mint === WSOL && t.toUserAccount === wallet)
    .reduce((sum, t) => sum + Number(t.tokenAmount || 0), 0);

  const nativeOut = (tx.nativeTransfers || [])
    .filter(t => t.fromUserAccount === wallet)
    .map(t => Number(t.amount || 0) / 1e9)
    .filter(n => n > 0.01);

  // Native transfers can represent funding a wrapped-SOL account.
  // Do not add native and WSOL values together.
  const estimatedSpend = wsolOut > 0
    ? wsolOut
    : (nativeOut.length ? Math.max(...nativeOut) : null);

  const direction =
    tokenIn > 0 && tokenOut === 0 ? "BUY" :
    tokenOut > 0 && tokenIn === 0 ? "SELL" :
    tokenIn > 0 && tokenOut > 0 ? "MIXED" :
    "UNDETERMINED";

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    datePHT: pht(tx.timestamp),
    type: tx.type,
    source: tx.source,
    direction,
    tokenIn,
    tokenOut,
    wsolOut,
    wsolIn,
    estimatedSpend,
    near076: direction === "BUY" &&
      estimatedSpend !== null &&
      Math.abs(estimatedSpend - TARGET) <= TOLERANCE
  };
}

function groupedBuys(buys) {
  const sorted = [...buys].sort((a, b) => a.timestamp - b.timestamp);
  const groups = [];

  for (let i = 0; i < sorted.length; i++) {
    let total = 0;
    const group = [];

    // Consecutive purchases within 60 minutes of the first buy.
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].timestamp - sorted[i].timestamp > 3600) break;

      const spend = sorted[j].estimatedSpend;
      if (spend === null) continue;

      total += spend;
      group.push(sorted[j].signature);

      if (Math.abs(total - TARGET) <= TOLERANCE) {
        groups.push({
          fromPHT: sorted[i].datePHT,
          toPHT: sorted[j].datePHT,
          combinedEstimatedSpend: total,
          signatures: [...group]
        });
      }
    }
  }

  return groups.slice(0, 30);
}

async function scan(entry) {
  let before = entry.before;
  let pages = 0;
  let reachedStart = false;

  const matches = new Map();

  while (pages < MAX_PAGES) {
    const txs = await fetchPage(entry.wallet, before);
    if (!txs.length) {
      reachedStart = true;
      break;
    }

    pages++;

    for (const tx of txs) {
      if (!tx.timestamp || tx.timestamp < START || tx.timestamp > END) {
        continue;
      }

      const touchesMint =
        (tx.tokenTransfers || []).some(t => t.mint === KEAINU) ||
        (tx.accountData || []).some(a =>
          (a.tokenBalanceChanges || []).some(c => c.mint === KEAINU)
        );

      if (touchesMint) {
        matches.set(tx.signature, analyze(tx, entry.wallet));
      }
    }

    const oldest = Math.min(
      ...txs.filter(t => t.timestamp).map(t => t.timestamp)
    );

    if (Number.isFinite(oldest) && oldest < START) {
      reachedStart = true;
      break;
    }

    if (txs.length < 100) {
      reachedStart = true;
      break;
    }

    const nextBefore = txs[txs.length - 1]?.signature;
    if (!nextBefore || nextBefore === before) break;

    before = nextBefore;

    if (pages % 25 === 0) {
      console.log(
        `${entry.wallet.slice(0, 8)}: ${pages} pages, ` +
        `${matches.size} Keainu transactions; oldest ${pht(oldest)}`
      );
    }

    await sleep(300);
  }

  const transactions = [...matches.values()]
    .sort((a, b) => a.timestamp - b.timestamp);

  const buys = transactions.filter(t => t.direction === "BUY");

  return {
    wallet: entry.wallet,
    pagesScanned: pages,
    completeThroughStart: reachedStart,
    keainuFound: transactions.length > 0,
    buyCount: buys.length,
    sellCount: transactions.filter(t => t.direction === "SELL").length,
    singleBuyMatches: buys.filter(t => t.near076),
    splitBuyMatches: groupedBuys(buys),
    transactions
  };
}

async function main() {
  const results = [];

  for (const [i, entry] of wallets.entries()) {
    console.log(`Scanning ${i + 1}/${wallets.length}: ${entry.wallet}`);

    try {
      const result = await scan(entry);
      results.push(result);

      console.log(
        `Keainu=${result.keainuFound}, ` +
        `buys=${result.buyCount}, ` +
        `singleMatches=${result.singleBuyMatches.length}, ` +
        `splitMatches=${result.splitBuyMatches.length}, ` +
        `complete=${result.completeThroughStart}`
      );
    } catch (error) {
      console.error(error.message);
      results.push({ wallet: entry.wallet, error: error.message });
    }

    fs.writeFileSync(
      "keainu-results.json",
      JSON.stringify(results, null, 2)
    );
  }

  const summary = results.map(r => ({
    wallet: r.wallet,
    found: r.keainuFound ?? false,
    buys: r.buyCount ?? 0,
    near076: r.singleBuyMatches?.length ?? 0,
    splitMatches: r.splitBuyMatches?.length ?? 0,
    complete: r.completeThroughStart ?? false,
    error: r.error || ""
  }));

  fs.writeFileSync(
    "keainu-summary.json",
    JSON.stringify(summary, null, 2)
  );

  console.table(summary);
}

main().catch(console.error);
