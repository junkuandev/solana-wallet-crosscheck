
const fs = require("fs");

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) throw Error("Missing HELIUS_API_KEY");

const EMBER = "5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6";
const WSOL = "So11111111111111111111111111111111111111112";

const wallets = [
  ["Finr5rgQ4B4oZxAfjpA61Cpw77ZJG73FHv9X8mqdZiL6",
   "5BjXKXeofeum3mH1VjQbMh7v42vKpJLVGTV5H1jG51hRCQtMYBmgUAy2eaz8h2y7hbXiSZ7hpVLC9knb1r35WWWZ"],
  ["kEFiAX3jo5NmemysQov342TZ9mGh6yp92GDRjhA8XDf",
   "4kcmvixBqhshg3SUR1AW13LikMMEDxmBDdtFNSDRfMtYo9wnEHmYgFJaV9kNKKQacXN7SuQJD8Zzw6W5SowCK84X"],
  ["AeBgCFnkSWMAwv3zjaJPB93hxEBUEVkhEyKVFaxT84pJ",
   "5k6QH4Y8cjpUqTKRP5aRZKibbXG1MVz2xU6J9cpx57CQbFfrJmKzJ8QzyFY3G7JJxQXm2hYuqqVp48tYhqZJZYjU"],
  ["DZbgq3yE3r41EFszV3XastvyS8j8QnmNT37nsq7sxR66",
   "3fRmXfpBuh4cgfqXir7euC4S5x9A2BW4v2GNWHcHqkR2j8v2ka655nQgCjxyiNQckqrWPFtuTX4S6N5nzFnscq3P"],
  ["NULLioEUhd89Jo5Acm9sX88bwjNjrsAVy6KWkXD7qZh",
   "2QZtCv1DnPKVJ5HeNYkq1RA4cgays4JH6w3Z1g3nLnMbAKV3dFwpA7knsWwaSQ5i1tVyMyJAhgCESLybtKtQDHMP"]
];

const START = Date.parse("2026-09-09T00:00:00+08:00") / 1000;
const END = Date.parse("2026-09-15T00:45:00+08:00") / 1000;
const TARGET = 1.01;
const TOLERANCE = 0.16;
const MAX_PAGES = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pht(ts) {
  return new Date(ts * 1000).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    hour12: true
  });
}

async function page(wallet, before) {
  const u = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );
  u.searchParams.set("api-key", KEY);
  u.searchParams.set("limit", "100");
  if (before) u.searchParams.set("before", before);

  for (let i = 0; i < 9; i++) {
    const r = await fetch(u);
    if ([429, 500, 502, 503, 504].includes(r.status)) {
      const header = Number(r.headers.get("retry-after"));
      const wait = Number.isFinite(header) && header > 0
        ? header * 1000
        : Math.min(2000 * 2 ** i, 60000);
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  throw Error("Helius retries exhausted");
}

function analyze(tx, wallet) {
  const all = tx.tokenTransfers || [];
  const tokenIn = all
    .filter(t => t.mint === EMBER && t.toUserAccount === wallet)
    .reduce((a, t) => a + Number(t.tokenAmount || 0), 0);
  const tokenOut = all
    .filter(t => t.mint === EMBER && t.fromUserAccount === wallet)
    .reduce((a, t) => a + Number(t.tokenAmount || 0), 0);

  const wsolOut = all
    .filter(t => t.mint === WSOL && t.fromUserAccount === wallet)
    .reduce((a, t) => a + Number(t.tokenAmount || 0), 0);
  const wsolIn = all
    .filter(t => t.mint === WSOL && t.toUserAccount === wallet)
    .reduce((a, t) => a + Number(t.tokenAmount || 0), 0);

  const direction = tokenIn > 0 && tokenOut === 0 ? "BUY" :
    tokenOut > 0 && tokenIn === 0 ? "SELL" :
    tokenIn > 0 && tokenOut > 0 ? "MIXED" : "UNKNOWN";

  // Avoid confusing tiny Jupiter fees with a SOL purchase.
  // Native SOL and WSOL can represent the same wrapped funds.
  // For unsupported routing, leave spend unknown instead of guessing.
  const spent = direction === "BUY" && wsolOut >= 0.05
    ? wsolOut : null;

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    datePHT: pht(tx.timestamp),
    direction,
    source: tx.source,
    type: tx.type,
    tokenIn,
    tokenOut,
    wsolOut,
    wsolIn,
    estimatedSpend: spent,
    approximateMatch: spent !== null &&
      Math.abs(spent - TARGET) <= TOLERANCE
  };
}

function report(results) {
  fs.writeFileSync(
    "ember-results.json",
    JSON.stringify(results, null, 2)
  );

  const summary = results.map(r => ({
    wallet: r.wallet,
    pages: r.pages,
    complete: r.complete,
    found: r.transactions.length > 0,
    buys: r.transactions.filter(t => t.direction === "BUY").length,
    sells: r.transactions.filter(t => t.direction === "SELL").length,
    near101: r.transactions.filter(t => t.approximateMatch).length,
    closestBuys: r.transactions
      .filter(t => t.direction === "BUY" && t.estimatedSpend !== null)
      .sort((a, b) =>
        Math.abs(a.estimatedSpend - TARGET) -
        Math.abs(b.estimatedSpend - TARGET)
      ).slice(0, 10).map(t => ({
        datePHT: t.datePHT,
        sol: t.estimatedSpend,
        signature: t.signature
      })),
    error: r.error || ""
  }));

  fs.writeFileSync(
    "ember-summary.json",
    JSON.stringify(summary, null, 2)
  );

  return summary;
}

async function main() {
  const results = [];

  for (const [wallet, initialCursor] of wallets) {
    console.log(`\nScanning ${wallet}`);
    let before = initialCursor;
    let pages = 0;
    let complete = false;
    let error = null;
    const found = new Map();

    while (pages < MAX_PAGES) {
      try {
        const txs = await page(wallet, before);
        if (!txs.length) {
          complete = true;
          break;
        }
        pages++;

        const valid = txs.filter(t => Number.isFinite(t.timestamp));
        if (!valid.length) {
          error = "Page without valid timestamps";
          break;
        }

        for (const tx of valid) {
          if (tx.timestamp < START || tx.timestamp > END) continue;

          const hasMint = (tx.tokenTransfers || [])
            .some(t => t.mint === EMBER) ||
            (tx.accountData || []).some(a =>
              (a.tokenBalanceChanges || []).some(c => c.mint === EMBER)
            );

          if (hasMint) found.set(tx.signature, analyze(tx, wallet));
        }

        const oldest = Math.min(...valid.map(t => t.timestamp));
        if (pages % 25 === 0) {
          console.log(
            `${pages} pages | oldest ${pht(oldest)} | ` +
            `EMBER ${found.size}`
          );
        }

        if (oldest < START || txs.length < 100) {
          complete = true;
          break;
        }

        const next = txs[txs.length - 1]?.signature;
        if (!next || next === before) {
          error = "Pagination did not advance";
          break;
        }

        before = next;
        await sleep(350);
      } catch (e) {
        error = e.message;
        console.error(error);
        break;
      }
    }

    results.push({
      wallet,
      pages,
      complete,
      error,
      transactions: [...found.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
    });

    console.table(report(results).slice(-1));
  }

  console.log("\nFINAL");
  console.table(report(results));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
