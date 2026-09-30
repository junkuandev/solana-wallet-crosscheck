const fs = require('fs');

const API_KEY = process.env.HELIUS_API_KEY;

if (!API_KEY) {
  throw new Error('HELIUS_API_KEY is missing');
}

const SUBS =
  'BW1HeTnP1ZpSyvoExMKCW86vdEAShjwBV6dUfgZwpump';

const wallets = [
  '81BSLfATAu54UuL53FhL9x51EsgzkPPDc1QaLMqo7YKK',
  '91Y8ehmavUpQRwSDzX7xYDxwNv6CueWTxZaZfwL7SPqA',
  'JA6gEx8NDqftQyKe8zYec3iLataSBFV5JWkb3VeFCRvK',
  'GR8oBuKsrZJEsVMwq4ziFuE6hqF3FU6P7grHkAx2sSaW',
  '6nTgTJ8PbqjMPx53QjVgEN81CGRXnzTZdfX7BqdoB8EA'
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function ts(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/*
  You remembered SUBS activity around:
  Sep 29, 2026 2–4 AM Philippines time.

  We're intentionally looking much earlier too,
  because the initial buy may have happened hours before.
*/
const SEARCH_START =
  ts('2026-09-28T12:00:00+08:00');

const SEARCH_END =
  ts('2026-09-29T05:00:00+08:00');

const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 700;

function containsSubs(tx) {
  // Standard parsed token transfers
  const transferMatch =
    (tx.tokenTransfers || []).some(
      t => t.mint === SUBS
    );

  if (transferMatch) {
    return true;
  }

  /*
    Also inspect accountData token balance changes.
    This catches cases where Helius didn't classify
    the transaction cleanly as a swap.
  */
  const balanceMatch =
    (tx.accountData || []).some(account =>
      (account.tokenBalanceChanges || []).some(
        change => change.mint === SUBS
      )
    );

  return balanceMatch;
}

function simplifyTx(tx) {
  return {
    signature: tx.signature,
    timestamp: tx.timestamp,

    datePHT: tx.timestamp
      ? new Date(
          tx.timestamp * 1000
        ).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila'
        })
      : null,

    type: tx.type,
    source: tx.source,
    feePayer: tx.feePayer,

    description: tx.description,

    tokenTransfers:
      (tx.tokenTransfers || []).filter(
        t => t.mint === SUBS
      ),

    relevantAccountData:
      (tx.accountData || [])
        .filter(account =>
          (account.tokenBalanceChanges || [])
            .some(change =>
              change.mint === SUBS
            )
        )
  };
}

async function fetchPage(wallet, before = null) {
  const url = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );

  url.searchParams.set(
    'api-key',
    API_KEY
  );

  url.searchParams.set(
    'limit',
    String(PAGE_SIZE)
  );

  /*
    IMPORTANT:
    NO type=SWAP FILTER HERE.
  */

  if (before) {
    url.searchParams.set(
      'before',
      before
    );
  }

  for (let attempt = 1; attempt <= 8; attempt++) {
    const response = await fetch(url);

    if (
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      const retryAfter =
        Number(
          response.headers.get('retry-after')
        );

      const waitMs =
        Number.isFinite(retryAfter) &&
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(
              1000 * (2 ** (attempt - 1)),
              60000
            );

      console.log(
        `HTTP ${response.status}. ` +
        `Waiting ${Math.round(waitMs / 1000)}s...`
      );

      await sleep(waitMs);

      continue;
    }

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `Helius ${response.status}: ${body}`
      );
    }

    return response.json();
  }

  throw new Error(
    'Maximum retries reached'
  );
}

async function scanWallet(wallet) {
  console.log(
    `\nScanning ${wallet}`
  );

  let before = null;

  let pages = 0;
  let transactionsChecked = 0;

  const matches = [];

  while (true) {
    const txs =
      await fetchPage(
        wallet,
        before
      );

    pages++;

    if (!txs.length) {
      console.log(
        'No older transactions.'
      );

      break;
    }

    transactionsChecked +=
      txs.length;

    let oldest =
      Infinity;

    for (const tx of txs) {
      if (!tx.timestamp) {
        continue;
      }

      oldest = Math.min(
        oldest,
        tx.timestamp
      );

      /*
        We only care about transactions inside
        our expanded SUBS window.
      */
      if (
        tx.timestamp >= SEARCH_START &&
        tx.timestamp <= SEARCH_END &&
        containsSubs(tx)
      ) {
        matches.push(
          simplifyTx(tx)
        );

        console.log(
          `>>> SUBS FOUND: ${
            new Date(
              tx.timestamp * 1000
            ).toLocaleString(
              'en-PH',
              {
                timeZone:
                  'Asia/Manila'
              }
            )
          }`
        );
      }
    }

    const oldestDate =
      Number.isFinite(oldest)
        ? new Date(
            oldest * 1000
          ).toLocaleString(
            'en-PH',
            {
              timeZone:
                'Asia/Manila'
            }
          )
        : 'unknown';

    console.log(
      `Page ${pages} | ` +
      `${txs.length} tx | ` +
      `oldest: ${oldestDate} | ` +
      `SUBS matches: ${matches.length}`
    );

    /*
      Once we're older than Sep 28 noon PHT,
      we've covered the entire relevant window.
    */
    if (
      Number.isFinite(oldest) &&
      oldest < SEARCH_START
    ) {
      console.log(
        'Reached beginning of SUBS search window.'
      );

      break;
    }

    if (txs.length < PAGE_SIZE) {
      break;
    }

    const last =
      txs[txs.length - 1];

    if (!last?.signature) {
      break;
    }

    before =
      last.signature;

    await sleep(
      REQUEST_DELAY_MS
    );
  }

  return {
    wallet,
    foundSUBS:
      matches.length > 0,

    matches,

    pagesScanned:
      pages,

    transactionsChecked
  };
}

async function main() {
  const results = [];

  for (
    let i = 0;
    i < wallets.length;
    i++
  ) {
    console.log(
      `\n==========================`
    );

    console.log(
      `[${i + 1}/${wallets.length}]`
    );

    console.log(
      `==========================`
    );

    try {
      const result =
        await scanWallet(
          wallets[i]
        );

      results.push(
        result
      );

      if (
        result.foundSUBS
      ) {
        console.log(
          `\n*** STRONG CANDIDATE ***`
        );

        console.log(
          wallets[i]
        );
      }

    } catch (error) {
      console.error(
        error.message
      );

      results.push({
        wallet:
          wallets[i],

        error:
          error.message
      });
    }

    fs.writeFileSync(
      'subs-results.json',
      JSON.stringify(
        results,
        null,
        2
      )
    );

    await sleep(
      REQUEST_DELAY_MS
    );
  }

  const matches =
    results.filter(
      x => x.foundSUBS
    );

  fs.writeFileSync(
    'subs-matches.json',
    JSON.stringify(
      matches,
      null,
      2
    )
  );

  console.log(
    '\n=========================='
  );

  console.log(
    `SUBS MATCHING WALLETS: ${matches.length}`
  );

  console.log(
    '=========================='
  );

  matches.forEach(
    x =>
      console.log(
        x.wallet
      )
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
