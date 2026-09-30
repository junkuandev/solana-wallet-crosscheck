
const fs = require("fs");

const API_KEY = process.env.HELIUS_API_KEY;

if (!API_KEY) {
  throw new Error("HELIUS_API_KEY is missing");
}

const WSOL =
  "So11111111111111111111111111111111111111112";

const USDC =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const USDT =
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkYjz3FZ4mKSLFJxC";

const EXCLUDED_MINTS = new Set([
  WSOL,
  USDC,
  USDT
]);

const WALLETS = [
  {
    wallet:
      "Finr5rgQ4B4oZxAfjpA61Cpw77ZJG73FHv9X8mqdZiL6",
    before:
      "5BjXKXeofeum3mH1VjQbMh7v42vKpJLVGTV5H1jG51hRCQtMYBmgUAy2eaz8h2y7hbXiSZ7hpVLC9knb1r35WWWZ"
  },
  {
    wallet:
      "kEFiAX3jo5NmemysQov342TZ9mGh6yp92GDRjhA8XDf",
    before:
      "4kcmvixBqhshg3SUR1AW13LikMMEDxmBDdtFNSDRfMtYo9wnEHmYgFJaV9kNKKQacXN7SuQJD8Zzw6W5SowCK84X"
  },
  {
    wallet:
      "AeBgCFnkSWMAwv3zjaJPB93hxEBUEVkhEyKVFaxT84pJ",
    before:
      "5k6QH4Y8cjpUqTKRP5aRZKibbXG1MVz2xU6J9cpx57CQbFfrJmKzJ8QzyFY3G7JJxQXm2hYuqqVp48tYhqZJZYjU"
  },
  {
    wallet:
      "DZbgq3yE3r41EFszV3XastvyS8j8QnmNT37nsq7sxR66",
    before:
      "3fRmXfpBuh4cgfqXir7euC4S5x9A2BW4v2GNWHcHqkR2j8v2ka655nQgCjxyiNQckqrWPFtuTX4S6N5nzFnscq3P"
  },
  {
    wallet:
      "NULLioEUhd89Jo5Acm9sX88bwjNjrsAVy6KWkXD7qZh",
    before:
      "2QZtCv1DnPKVJ5HeNYkq1RA4cgays4JH6w3Z1g3nLnMbAKV3dFwpA7knsWwaSQ5i1tVyMyJAhgCESLybtKtQDHMP"
  }
];

// All timestamps in Philippine time (UTC+8).
const START =
  Date.parse("2026-09-12T00:00:00+08:00") / 1000;

const END =
  Date.parse("2026-09-15T00:45:00+08:00") / 1000;

const TARGET_SOL = 1.01;
const MIN_SOL = 0.85;
const MAX_SOL = 1.17;

const PAGE_LIMIT = 100;
const MAX_PAGES = 5000;
const REQUEST_DELAY = 350;

// Split purchases within 60 minutes.
const GROUP_WINDOW_SECONDS = 3600;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function formatPHT(timestamp) {
  return new Date(timestamp * 1000)
    .toLocaleString("en-US", {
      timeZone: "Asia/Manila",
      hour12: true
    });
}

function round(value, places = 9) {
  return Number(value.toFixed(places));
}

function inTargetRange(value) {
  return (
    Number.isFinite(value) &&
    value >= MIN_SOL &&
    value <= MAX_SOL
  );
}

async function fetchTransactions(wallet, before) {
  const url = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );

  url.searchParams.set("api-key", API_KEY);
  url.searchParams.set("limit", String(PAGE_LIMIT));

  // No transaction-type filter.
  if (before) {
    url.searchParams.set("before", before);
  }

  for (let attempt = 0; attempt < 9; attempt++) {
    const response = await fetch(url);

    if (
      [429, 500, 502, 503, 504]
        .includes(response.status)
    ) {
      const retryAfter = Number(
        response.headers.get("retry-after")
      );

      const delay =
        Number.isFinite(retryAfter) &&
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(
              2000 * 2 ** attempt,
              60000
            );

      console.log(
        `HTTP ${response.status}; waiting ${delay}ms`
      );

      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Helius HTTP ${response.status}: ` +
        text.slice(0, 400)
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "Unexpected Helius response format"
      );
    }

    return data;
  }

  throw new Error("Helius retry limit reached");
}

/*
  Identify tokens entering or leaving
  the specific wallet.

  This prevents confusing pool transfers
  or unrelated intermediary accounts
  with the wallet's purchases.
*/
function getTokenMovements(tx, wallet) {
  const movements = new Map();

  for (const transfer of tx.tokenTransfers || []) {
    const mint = transfer.mint;

    if (!mint || EXCLUDED_MINTS.has(mint)) {
      continue;
    }

    const amount = Number(transfer.tokenAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    if (!movements.has(mint)) {
      movements.set(mint, {
        mint,
        received: 0,
        sent: 0
      });
    }

    const movement = movements.get(mint);

    if (transfer.toUserAccount === wallet) {
      movement.received += amount;
    }

    if (transfer.fromUserAccount === wallet) {
      movement.sent += amount;
    }
  }

  return [...movements.values()];
}

/*
  SOL payment evidence.

  Some swaps spend existing WSOL.
  Others wrap native SOL before executing.

  Do not add native and WSOL values together,
  since these can represent the same funds.

  Return separate candidates rather than
  pretending the payment is always exact.
*/
function getSolEvidence(tx, wallet) {
  const transfers = tx.tokenTransfers || [];

  const outgoingWsol = transfers
    .filter(t =>
      t.mint === WSOL &&
      t.fromUserAccount === wallet
    )
    .map(t => Number(t.tokenAmount))
    .filter(v => Number.isFinite(v) && v > 0);

  const incomingWsol = transfers
    .filter(t =>
      t.mint === WSOL &&
      t.toUserAccount === wallet
    )
    .map(t => Number(t.tokenAmount))
    .filter(v => Number.isFinite(v) && v > 0);

  const nativeOut = (tx.nativeTransfers || [])
    .filter(t => t.fromUserAccount === wallet)
    .map(t => Number(t.amount) / 1e9)
    .filter(v => Number.isFinite(v) && v > 0);

  // WSOL transfers below 0.05 SOL might
  // represent fees rather than purchase spend.
  const substantialWsol =
    outgoingWsol.filter(v => v >= 0.05);

  const substantialNative =
    nativeOut.filter(v => v >= 0.05);

  const paymentCandidates = [];

  for (const amount of substantialWsol) {
    paymentCandidates.push({
      amount: round(amount),
      method: "WSOL_OUT"
    });
  }

  for (const amount of substantialNative) {
    paymentCandidates.push({
      amount: round(amount),
      method: "NATIVE_SOL_OUT"
    });
  }

  return {
    outgoingWsol: round(
      outgoingWsol.reduce((a, b) => a + b, 0)
    ),
    incomingWsol: round(
      incomingWsol.reduce((a, b) => a + b, 0)
    ),
    nativeOutflows: substantialNative.map(v =>
      round(v)
    ),
    paymentCandidates
  };
}

/*
  A strong directional buy must have:
  1. The token entering the wallet.
  2. No same-token outflow in that transaction.

  Payment evidence is analyzed separately.
*/
function extractBuys(tx, wallet) {
  const movements = getTokenMovements(tx, wallet);
  const sol = getSolEvidence(tx, wallet);

  const buys = [];

  for (const token of movements) {
    if (
      token.received <= 0 ||
      token.sent > 0
    ) {
      continue;
    }

    const nearPayments =
      sol.paymentCandidates.filter(p =>
        inTargetRange(p.amount)
      );

    const closestPayment =
      [...sol.paymentCandidates]
        .sort((a, b) =>
          Math.abs(a.amount - TARGET_SOL) -
          Math.abs(b.amount - TARGET_SOL)
        )[0] || null;

    buys.push({
      wallet,
      mint: token.mint,
      signature: tx.signature,
      timestamp: tx.timestamp,
      datePHT: formatPHT(tx.timestamp),
      source: tx.source,
      type: tx.type,
      receivedAmount: token.received,
      paymentCandidates: sol.paymentCandidates,
      closestPayment,
      near101: nearPayments.length > 0,
      nearPayments,
      paymentEvidence:
        sol.paymentCandidates.length > 0
          ? "AVAILABLE"
          : "UNKNOWN"
    });
  }

  return buys;
}

/*
  Consider consecutive buys of the same mint,
  starting no more than 60 minutes apart.

  Only combine transactions when each
  transaction has one identifiable substantial
  payment candidate.

  We preserve ambiguous trades separately.
*/
function findSplitMatches(buys) {
  const byMint = new Map();

  for (const buy of buys) {
    if (!byMint.has(buy.mint)) {
      byMint.set(buy.mint, []);
    }

    byMint.get(buy.mint).push(buy);
  }

  const matches = [];

  for (const [mint, entries] of byMint) {
    entries.sort((a, b) =>
      a.timestamp - b.timestamp
    );

    for (let i = 0; i < entries.length; i++) {
      let total = 0;
      const group = [];

      for (let j = i; j < entries.length; j++) {
        const buy = entries[j];

        if (
          buy.timestamp - entries[i].timestamp >
          GROUP_WINDOW_SECONDS
        ) {
          break;
        }

        // Ambiguous payments should not be
        // silently selected or double counted.
        if (buy.paymentCandidates.length !== 1) {
          break;
        }

        total += buy.paymentCandidates[0].amount;
        group.push(buy);

        if (total > MAX_SOL) {
          break;
        }

        // Single buys are already reported.
        if (
          group.length >= 2 &&
          inTargetRange(total)
        ) {
          matches.push({
            wallet: buy.wallet,
            mint,
            totalSol: round(total),
            transactionCount: group.length,
            firstPHT: group[0].datePHT,
            lastPHT: buy.datePHT,
            signatures: group.map(t =>
              t.signature
            )
          });
        }
      }
    }
  }

  return matches;
}

function saveResults(results) {
  fs.writeFileSync(
    "ember-reverse-results.json",
    JSON.stringify(results, null, 2)
  );

  const summary = results.map(result => {
    const buys = result.buys || [];
    const exact = buys.filter(b =>
      b.near101
    );

    return {
      wallet: result.wallet,
      pagesScanned: result.pagesScanned || 0,
      completed: result.completed || false,
      transactionsChecked:
        result.transactionsChecked || 0,
      totalBuys: buys.length,
      distinctMints: new Set(
        buys.map(b => b.mint)
      ).size,
      near101Buys: exact.length,
      splitMatches:
        result.splitMatches?.length || 0,
      error: result.error || null
    };
  });

  fs.writeFileSync(
    "ember-reverse-summary.json",
    JSON.stringify(summary, null, 2)
  );

  const strong = results.flatMap(result => {
    const singles = (result.buys || [])
      .filter(b => b.near101)
      .map(b => ({
        kind: "SINGLE",
        wallet: b.wallet,
        mint: b.mint,
        datePHT: b.datePHT,
        sol: b.closestPayment?.amount ?? null,
        signature: b.signature
      }));

    const splits = (result.splitMatches || [])
      .map(s => ({
        kind: "SPLIT",
        wallet: s.wallet,
        mint: s.mint,
        datePHT: s.firstPHT,
        sol: s.totalSol,
        signature: s.signatures.join(";")
      }));

    return [...singles, ...splits];
  });

  fs.writeFileSync(
    "ember-reverse-candidates.json",
    JSON.stringify(strong, null, 2)
  );

  console.table(summary);
}

async function scanWallet(entry) {
  const wallet = entry.wallet;

  let before = entry.before;
  let pagesScanned = 0;
  let transactionsChecked = 0;
  let completed = false;
  let error = null;

  const buysByKey = new Map();

  while (pagesScanned < MAX_PAGES) {
    let transactions;

    try {
      transactions = await fetchTransactions(
        wallet,
        before
      );
    } catch (e) {
      error = e.message;
      break;
    }

    if (!transactions.length) {
      completed = true;
      break;
    }

    pagesScanned++;
    transactionsChecked += transactions.length;

    const valid = transactions.filter(tx =>
      Number.isFinite(tx.timestamp)
    );

    if (!valid.length) {
      error = "Page without valid timestamps";
      break;
    }

    for (const tx of valid) {
      if (
        tx.timestamp < START ||
        tx.timestamp > END
      ) {
        continue;
      }

      for (const buy of extractBuys(tx, wallet)) {
        const key =
          `${buy.signature}:${buy.mint}`;

        buysByKey.set(key, buy);
      }
    }

    const oldest = Math.min(
      ...valid.map(tx => tx.timestamp)
    );

    if (pagesScanned % 25 === 0) {
      console.log(
        `${wallet.slice(0, 10)} | ` +
        `pages=${pagesScanned} | ` +
        `buys=${buysByKey.size} | ` +
        `oldest=${formatPHT(oldest)}`
      );
    }

    if (oldest < START) {
      completed = true;
      break;
    }

    if (transactions.length < PAGE_LIMIT) {
      completed = true;
      break;
    }

    const nextBefore =
      transactions[transactions.length - 1]
        ?.signature;

    if (
      !nextBefore ||
      nextBefore === before
    ) {
      error = "Pagination stalled";
      break;
    }

    before = nextBefore;
    await sleep(REQUEST_DELAY);
  }

  if (!completed && !error) {
    error =
      `Reached MAX_PAGES (${MAX_PAGES})`;
  }

  const buys = [...buysByKey.values()]
    .sort((a, b) => a.timestamp - b.timestamp);

  const splitMatches = findSplitMatches(buys);

  return {
    wallet,
    pagesScanned,
    transactionsChecked,
    completed,
    error,
    buys,
    splitMatches
  };
}

async function main() {
  const results = [];

  for (let i = 0; i < WALLETS.length; i++) {
    const entry = WALLETS[i];

    console.log(
      `\n[${i + 1}/${WALLETS.length}] ` +
      entry.wallet
    );

    const result = await scanWallet(entry);

    results.push(result);
    saveResults(results);

    console.log(
      `Completed=${result.completed} | ` +
      `Buys=${result.buys.length} | ` +
      `Near 1.01 SOL=${
        result.buys.filter(b => b.near101).length
      } | ` +
      `Split=${result.splitMatches.length}`
    );

    await sleep(REQUEST_DELAY);
  }

  saveResults(results);

  console.log("\nReverse scan finished.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
