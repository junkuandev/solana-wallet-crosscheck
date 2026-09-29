const fs = require('fs');

const API_KEY = process.env.HELIUS_API_KEY;

if (!API_KEY) {
  throw new Error('HELIUS_API_KEY is missing');
}

/* =========================================================
   KNOWN TOKEN MINTS
   ========================================================= */

const TOKENS = {
  SUBS: 'BW1HeTnP1ZpSyvoExMKCW86vdEAShjwBV6dUfgZwpump',
  COW: 'CUh9nnRSojHHdLWzVQQ2rZBmnq66zLg8TfcuQUyy6BLr'
};

const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

const IGNORE_CANDIDATE_MINTS = new Set([
  WSOL,
  USDC,
  USDT
]);

/* =========================================================
   TIME WINDOWS — ALL TIMES ARE PHILIPPINES UTC+8

   We store both:
   - strict window = what you specifically remember
   - expanded window = allows the purchase to have occurred
     several hours before the profit / remembered activity
   ========================================================= */

function ts(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

const WINDOWS = {
  SUBS: {
    strictStart: ts('2026-09-29T02:00:00+08:00'),
    strictEnd:   ts('2026-09-29T04:00:00+08:00'),

    // Allow purchase several hours earlier.
    expandedStart: ts('2026-09-28T18:00:00+08:00'),
    expandedEnd:   ts('2026-09-29T04:30:00+08:00')
  },

  COW: {
    strictStart: ts('2026-09-25T10:00:00+08:00'),
    strictEnd:   ts('2026-09-25T14:00:00+08:00'),

    // Allow earlier entry.
    expandedStart: ts('2026-09-25T06:00:00+08:00'),
    expandedEnd:   ts('2026-09-25T14:30:00+08:00')
  },

  IWA: {
    // Known trade date: Aug 28
    // Wide enough to include previous-day entry.
    start: ts('2026-08-27T12:00:00+08:00'),
    end:   ts('2026-08-29T12:00:00+08:00')
  },

  CRIMECAT: {
    // Around Sep 9, ~30x
    start: ts('2026-09-08T12:00:00+08:00'),
    end:   ts('2026-09-10T12:00:00+08:00')
  },

  ANSEM: {
    // Around Sep 19, ~54x
    start: ts('2026-09-18T12:00:00+08:00'),
    end:   ts('2026-09-20T12:00:00+08:00')
  }
};

/*
  Absolute oldest transaction we need.

  The scanner will NOT stop based on number of pages.
  It stops when it has actually paginated past this date.
*/
const ABSOLUTE_SEARCH_START =
  ts('2026-08-27T00:00:00+08:00');

/*
  If we pass this point without finding BOTH SUBS and COW,
  there's no reason to scan back into August for that wallet.
*/
const RECENT_MATCH_CUTOFF =
  ts('2026-09-25T05:30:00+08:00');

/* =========================================================
   WALLETS
   ========================================================= */

const wallets = [
  "GYtBXBQhBQ2xvb9RY2TRgNV3QhiCzR8rdNJdqgvwroEw",
  "GYvpLobJrehcQu3cydVupfqeT2drByGWjdeqR7EQzs5x",
  "EjC4myWZbW7V1cRQrb7PYU5DHqPCQ62cGhECFp3f6oSM",
  "Ge9qvViVvDVfJAegfAkj6zjt6B6HH5XgeYpfpXjLSTYU",
  "8qSooGyifxZj7VU1wqqtwLpo8EJ4UmNXNTpxqp9sxvi",
  "HR77fNZiKUCxJGD4tCgpQ5HDhgx7rcAMX5ZNGQGhpJtz",
  "2mBLBMzu91AZUBES2psMvv7zkWevf9mQk3KYHZNp7rfd",
  "3HgPjjBPoKbpyhqRx3ScMNNwMRAaoxPW3fvHtJBkMaZA",
  "HAb7c5mNWASiwVxHkeAvSmPKfC1RQVfSZ9Ay5WULddbz",
  "8ptj3ThMDwGCGP7XEFickwiaPqxLemGDQjZ5nkfKdegT",
  "4AdJReqFYCrxDCwg97YtJL7xNnsq6L9DE8GATTjJdjhS",
  "DVr2ipuTnpkgTYgVsUj72CcfrqowD4GfVnP68nSNRaBm",
  "7fEXteaTtmX1uR8fpChEXsevM4icH5vq8LNL9dzDupX2",
  "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
  "6BTyNHYQ7hCGKpSmRvLge5KX1ckDrZorpzquVeX2o9ka",
  "6hdyasvGLK9sjzu7QQonJKo74FHRswbwe1FW3ragGpBM",
  "7Xsy7dHGvRwuo8eHcj3JQCnh44F4dNGtPGKx1rp9wMZL",
  "314hSapUP5w9gtzYvVBRMLrfKeXX1RekvCg1sXhQvYy5",
  "3UVd45FM8nGZ93wDiohuixJufio55UVAwUCeN9ypzj5y",
  "3gw9qKR2CqEFSxSSuPJbRfVknHq7WSgbRhf9f9MQdjMu",
  "J8mE1L9wQAw2Tq6Vd1t5eJh1hqiA4Pg47552XZuM9t6t",
  "4ziYEjZC19DCrpc3TRvLaeNyUmN58cuKwMxTdSFwJW4z",
  "8Lkma6KPCVCmaduX3breABhXifbGhnoWUktpjZBh2X3b",
  "AyYkLr3H2eL7Lyt1dksRn5qPzjriGrsbGNGYvgop98s5",
  "7e1t5YaPSRRZFS91ohZFoFjfGh9bmQ3e59dkGNq8cvy7",
  "4eaEGA4FTUQYJTUyqp6689Gtr5rijTWgRaY2GzfhcYAB",
  "BxMo47JcFjZFM9bpNCibdapL67PVBgTk6JJa6WVU7qwk",
  "2TrwKy439veGrw24bp4fKmkdQocakcX749z3RcxKvhsH",
  "CBLnAuUdmziTkjTJ16Y4DqiyDj4qeqkonwqamSxzuKua",
  "Hna2i6Q9RzBmuHqAydfdxDnaoVuKtDc4D7RbyMN8paiF",
  "6B8c1eApGmjV4Wns96UQ5FX12CQCmJ9cLLN2CpRDM5Jn",
  "81BSLfATAu54UuL53FhL9x51EsgzkPPDc1QaLMqo7YKK",
  "5nCy88iF6LdubMSPCYt6MnYXE2n5bqJYMV6HBk5mXmL7",
  "BEvw9mQbfQwbnQKy4XJQuxDbADuJMAhKaUVtdjj4fz8N",
  "CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw",
  "7entn7t3scbg2fq7fCmNgYebRDiju5DUaw1subwYZxrP",
  "DUV1VJd8wZoY6Fvazne5QWSX3BiHTHEYmWwdBVJBFXLd",
  "91Y8ehmavUpQRwSDzX7xYDxwNv6CueWTxZaZfwL7SPqA",
  "JA6gEx8NDqftQyKe8zYec3iLataSBFV5JWkb3VeFCRvK",
  "5kExnsrWVRqtxhsFXVE3co2uPAdBNiAP9igYnKzM1Lro",
  "2VepKm2D2ejy4rgNXs93qXDbxFoF6JekP5U15aKAsUnV",
  "CsFTKt1nz3PbxuD1nrE8WswDGFjLGfLr5CkRJudaPCEB",
  "5PbdkK8cEk1Cc6JsAnWjrrs3a3oSYvotayxsur5Aqa1s",
  "GR8oBuKsrZJEsVMwq4ziFuE6hqF3FU6P7grHkAx2sSaW",
  "kEFiAX3jo5NmemysQov342TZ9mGh6yp92GDRjhA8XDf",
  "3SkBCx49BsK64h6tssBBJZ1WNvpiLdnhnXNmJtP46d7b",
  "6nTgTJ8PbqjMPx53QjVgEN81CGRXnzTZdfX7BqdoB8EA",
  "AA8kFMBELZfwh7aJvtEwNkFonRrxvFJYteojNPEGr4jo",
  "MFq7r1pHitGQgGXpy4jcobnTL1y33Q1eEG1tV64MZPY",
  "FCeJPFg3JsNtt9QeSHFkQEzBHGr8Hdb7pe6X3ovdYdkd",
  "6SB1n4SngPoTxehjUkwnsweVApUtrxCJz4kTajzBAyuh",
  "4ht81V1cV6z3rWzMbSj2tUthQdqt3pUuTKSZmhvUR1N3"
];

/* =========================================================
   API CONFIGURATION
   ========================================================= */

const PAGE_SIZE = 100;

/*
  ~1.4 requests/sec maximum from this scanner.
  Well below the free plan's 10 RPS limit.
*/
const REQUEST_DELAY_MS = 700;

/*
  Emergency protection only.

  This is NOT the normal stopping condition.

  2,000 pages * 100 transactions = 200,000 swaps for one
  wallet, so in practice timestamps should stop us long before.
*/
const EMERGENCY_MAX_PAGES = 2000;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

/* =========================================================
   HELPERS
   ========================================================= */

function inRange(timestamp, start, end) {
  return timestamp >= start && timestamp <= end;
}

function txHasMint(tx, mint) {
  return (tx.tokenTransfers || [])
    .some(transfer => transfer.mint === mint);
}

function getMints(tx) {
  return [
    ...new Set(
      (tx.tokenTransfers || [])
        .map(transfer => transfer.mint)
        .filter(Boolean)
    )
  ];
}

/*
  Helpful later for your:
      COW initial purchase ≈ 1 SOL

  Router transactions sometimes show the same WSOL amount
  multiple times, so we deduplicate identical amounts.
*/
function getWsolAmounts(tx) {
  const amounts = (tx.tokenTransfers || [])
    .filter(transfer => transfer.mint === WSOL)
    .map(transfer => Number(transfer.tokenAmount))
    .filter(value => Number.isFinite(value));

  return [
    ...new Set(
      amounts.map(value => Number(value.toFixed(9)))
    )
  ];
}

function simplifyKnownTransaction(tx) {
  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    datePHT: new Date(
      tx.timestamp * 1000
    ).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila'
    }),

    source: tx.source,
    type: tx.type,
    feePayer: tx.feePayer,

    wsolAmounts: getWsolAmounts(tx),

    mints: getMints(tx),

    tokenTransfers: tx.tokenTransfers || [],
    nativeTransfers: tx.nativeTransfers || []
  };
}

/* =========================================================
   UNKNOWN-TOKEN WINDOW COLLECTION

   Used for:
   IWA
   CRIMECAT
   ANSEM

   We don't guess the mint yet.

   Instead we collect every non-SOL/stablecoin mint that the
   matching wallet traded in those date windows.
   ========================================================= */

function createCandidateCollector() {
  return new Map();
}

function addCandidateTx(map, tx) {
  const mints = getMints(tx)
    .filter(mint => !IGNORE_CANDIDATE_MINTS.has(mint));

  for (const mint of mints) {
    if (!map.has(mint)) {
      map.set(mint, {
        mint,
        transactionCount: 0,
        signatures: [],
        timestamps: [],
        wsolAmounts: []
      });
    }

    const item = map.get(mint);

    item.transactionCount++;

    if (item.signatures.length < 20) {
      item.signatures.push(tx.signature);
    }

    if (item.timestamps.length < 20) {
      item.timestamps.push({
        timestamp: tx.timestamp,
        datePHT: new Date(
          tx.timestamp * 1000
        ).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila'
        })
      });
    }

    for (const amount of getWsolAmounts(tx)) {
      if (!item.wsolAmounts.includes(amount)) {
        item.wsolAmounts.push(amount);
      }
    }
  }
}

function collectorToArray(map) {
  return [...map.values()]
    .sort((a, b) =>
      b.transactionCount - a.transactionCount
    );
}

/* =========================================================
   HELIUS REQUEST
   ========================================================= */

async function fetchPage(wallet, before = null) {
  const url = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );

  url.searchParams.set('api-key', API_KEY);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('type', 'SWAP');

  if (before) {
    url.searchParams.set('before', before);
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
        Number(response.headers.get('retry-after'));

      let waitMs;

      if (
        Number.isFinite(retryAfter) &&
        retryAfter > 0
      ) {
        waitMs = retryAfter * 1000;
      } else {
        waitMs = Math.min(
          1000 * (2 ** (attempt - 1)),
          60000
        );

        // Jitter
        waitMs *= 0.8 + Math.random() * 0.4;
      }

      console.log(
        `    HTTP ${response.status}. ` +
        `Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Helius HTTP ${response.status}: ` +
        text.slice(0, 500)
      );
    }

    return response.json();
  }

  throw new Error(
    'Helius failed after maximum retries'
  );
}

/* =========================================================
   WALLET SCANNER
   ========================================================= */

async function scanWallet(wallet) {
  let before = null;

  let pagesScanned = 0;
  let swapsScanned = 0;

  const subsExpandedTxs = [];
  const subsStrictTxs = [];

  const cowExpandedTxs = [];
  const cowStrictTxs = [];

  const iwaCandidates = createCandidateCollector();
  const crimecatCandidates = createCandidateCollector();
  const ansemCandidates = createCandidateCollector();

  let recentMatchEstablished = false;

  for (
    let pageNumber = 1;
    pageNumber <= EMERGENCY_MAX_PAGES;
    pageNumber++
  ) {
    const transactions =
      await fetchPage(wallet, before);

    pagesScanned++;

    if (!transactions.length) {
      console.log(
        `    No more swaps. End of history.`
      );

      break;
    }

    swapsScanned += transactions.length;

    let oldestTimestamp = Infinity;

    for (const tx of transactions) {
      if (!tx.timestamp) continue;

      oldestTimestamp = Math.min(
        oldestTimestamp,
        tx.timestamp
      );

      /* -------------------------------
         SUBS
         ------------------------------- */

      if (
        txHasMint(tx, TOKENS.SUBS) &&
        inRange(
          tx.timestamp,
          WINDOWS.SUBS.expandedStart,
          WINDOWS.SUBS.expandedEnd
        )
      ) {
        subsExpandedTxs.push(
          simplifyKnownTransaction(tx)
        );

        if (
          inRange(
            tx.timestamp,
            WINDOWS.SUBS.strictStart,
            WINDOWS.SUBS.strictEnd
          )
        ) {
          subsStrictTxs.push(
            simplifyKnownTransaction(tx)
          );
        }
      }

      /* -------------------------------
         COW
         ------------------------------- */

      if (
        txHasMint(tx, TOKENS.COW) &&
        inRange(
          tx.timestamp,
          WINDOWS.COW.expandedStart,
          WINDOWS.COW.expandedEnd
        )
      ) {
        cowExpandedTxs.push(
          simplifyKnownTransaction(tx)
        );

        if (
          inRange(
            tx.timestamp,
            WINDOWS.COW.strictStart,
            WINDOWS.COW.strictEnd
          )
        ) {
          cowStrictTxs.push(
            simplifyKnownTransaction(tx)
          );
        }
      }

      /* -------------------------------
         UNKNOWN IWA CANDIDATES
         ------------------------------- */

      if (
        inRange(
          tx.timestamp,
          WINDOWS.IWA.start,
          WINDOWS.IWA.end
        )
      ) {
        addCandidateTx(
          iwaCandidates,
          tx
        );
      }

      /* -------------------------------
         UNKNOWN CRIMECAT CANDIDATES
         ------------------------------- */

      if (
        inRange(
          tx.timestamp,
          WINDOWS.CRIMECAT.start,
          WINDOWS.CRIMECAT.end
        )
      ) {
        addCandidateTx(
          crimecatCandidates,
          tx
        );
      }

      /* -------------------------------
         UNKNOWN ANSEM CANDIDATES
         ------------------------------- */

      if (
        inRange(
          tx.timestamp,
          WINDOWS.ANSEM.start,
          WINDOWS.ANSEM.end
        )
      ) {
        addCandidateTx(
          ansemCandidates,
          tx
        );
      }
    }

    recentMatchEstablished =
      subsExpandedTxs.length > 0 &&
      cowExpandedTxs.length > 0;

    const oldestText =
      Number.isFinite(oldestTimestamp)
        ? new Date(
            oldestTimestamp * 1000
          ).toLocaleString(
            'en-PH',
            { timeZone: 'Asia/Manila' }
          )
        : 'unknown';

    console.log(
      `    Page ${pageNumber} | ` +
      `${transactions.length} swaps | ` +
      `Oldest: ${oldestText} | ` +
      `SUBS=${subsExpandedTxs.length} | ` +
      `COW=${cowExpandedTxs.length}`
    );

    /* =====================================================
       FAST REJECTION

       We have paginated past the COW search period.

       If SUBS + COW are NOT both present by now, this wallet
       is not our target and there is no reason to burn API
       calls going all the way to August.
       ===================================================== */

    if (
      oldestTimestamp < RECENT_MATCH_CUTOFF &&
      !recentMatchEstablished
    ) {
      console.log(
        `    No SUBS+COW match by recent cutoff. ` +
        `Stopping this wallet early.`
      );

      break;
    }

    /* =====================================================
       FULL HISTORY STOPPING CONDITION

       Only matching wallets make it this far.

       Continue backward through however many pages are needed
       until we actually pass Aug 27.
       ===================================================== */

    if (
      recentMatchEstablished &&
      oldestTimestamp < ABSOLUTE_SEARCH_START
    ) {
      console.log(
        `    Reached Aug 27 historical cutoff. ` +
        `Full required history scanned.`
      );

      break;
    }

    /*
      If Helius returned fewer than 100 transactions,
      there are no older SWAP pages.
    */
    if (transactions.length < PAGE_SIZE) {
      console.log(
        `    Final available SWAP page reached.`
      );

      break;
    }

    const last =
      transactions[transactions.length - 1];

    if (!last?.signature) {
      console.log(
        `    No pagination signature available.`
      );

      break;
    }

    before = last.signature;

    await sleep(REQUEST_DELAY_MS);
  }

  /* =======================================================
     COW ~1 SOL CLUE
     ======================================================= */

  const cowOneSolCandidates =
    cowExpandedTxs.filter(tx =>
      tx.wsolAmounts.some(
        amount =>
          amount >= 0.8 &&
          amount <= 1.2
      )
    );

  return {
    wallet,

    match: recentMatchEstablished,

    pagesScanned,
    swapsScanned,

    SUBS: {
      found: subsExpandedTxs.length > 0,
      strictMatches: subsStrictTxs.length,
      expandedMatches: subsExpandedTxs.length,
      strictTransactions: subsStrictTxs,
      expandedTransactions: subsExpandedTxs
    },

    COW: {
      found: cowExpandedTxs.length > 0,
      strictMatches: cowStrictTxs.length,
      expandedMatches: cowExpandedTxs.length,

      possibleOneSolTransactions:
        cowOneSolCandidates,

      strictTransactions: cowStrictTxs,
      expandedTransactions: cowExpandedTxs
    },

    historicalCandidates: {
      IWA: collectorToArray(iwaCandidates),
      CRIMECAT:
        collectorToArray(crimecatCandidates),
      ANSEM:
        collectorToArray(ansemCandidates)
    }
  };
}

/* =========================================================
   FILE OUTPUT
   ========================================================= */

function saveOutputs(results) {
  const matches =
    results.filter(result => result.match);

  fs.writeFileSync(
    'results.json',
    JSON.stringify(results, null, 2)
  );

  fs.writeFileSync(
    'matches.json',
    JSON.stringify(matches, null, 2)
  );

  fs.writeFileSync(
    'matches.txt',
    matches
      .map(result => result.wallet)
      .join('\n')
  );

  const summary = [
    [
      'wallet',
      'match',
      'SUBS',
      'SUBS_strict',
      'SUBS_expanded',
      'COW',
      'COW_strict',
      'COW_expanded',
      'COW_around_1_SOL',
      'IWA_candidates',
      'CRIMECAT_candidates',
      'ANSEM_candidates',
      'pages_scanned',
      'swaps_scanned'
    ].join(','),

    ...results.map(result => [
      result.wallet,
      result.match ? 'YES' : 'NO',

      result.SUBS?.found ? 'YES' : 'NO',
      result.SUBS?.strictMatches ?? 0,
      result.SUBS?.expandedMatches ?? 0,

      result.COW?.found ? 'YES' : 'NO',
      result.COW?.strictMatches ?? 0,
      result.COW?.expandedMatches ?? 0,

      result.COW
        ?.possibleOneSolTransactions
        ?.length ?? 0,

      result.historicalCandidates
        ?.IWA?.length ?? 0,

      result.historicalCandidates
        ?.CRIMECAT?.length ?? 0,

      result.historicalCandidates
        ?.ANSEM?.length ?? 0,

      result.pagesScanned ?? '',
      result.swapsScanned ?? ''
    ].join(','))
  ];

  fs.writeFileSync(
    'summary.csv',
    summary.join('\n')
  );

  /*
    Separate compact file specifically for the unknown
    historical token identification.
  */

  const historical = matches.map(result => ({
    wallet: result.wallet,

    IWA: result.historicalCandidates.IWA,
    CRIMECAT:
      result.historicalCandidates.CRIMECAT,
    ANSEM:
      result.historicalCandidates.ANSEM
  }));

  fs.writeFileSync(
    'historical-token-candidates.json',
    JSON.stringify(
      historical,
      null,
      2
    )
  );
}

/* =========================================================
   MAIN
   ========================================================= */

async function main() {
  let results = [];

  if (fs.existsSync('results.json')) {
    try {
      results = JSON.parse(
        fs.readFileSync(
          'results.json',
          'utf8'
        )
      );

      console.log(
        `Loaded ${results.length} ` +
        `existing result(s).`
      );
    } catch {
      console.log(
        'Could not parse old results.json. ' +
        'Starting fresh.'
      );
    }
  }

  for (
    let i = 0;
    i < wallets.length;
    i++
  ) {
    const wallet = wallets[i];

    const previous =
      results.find(
        result =>
          result.wallet === wallet &&
          !result.error
      );

    if (previous) {
      console.log(
        `[${i + 1}/${wallets.length}] ` +
        `Already completed: ${wallet}`
      );

      continue;
    }

    console.log(
      `\n=======================================`
    );

    console.log(
      `[${i + 1}/${wallets.length}] ` +
      `${wallet}`
    );

    console.log(
      `=======================================`
    );

    try {
      const result =
        await scanWallet(wallet);

      results = results.filter(
        old => old.wallet !== wallet
      );

      results.push(result);

      if (result.match) {
        console.log(
          `\n    >>> SUBS + COW MATCH <<<`
        );

        if (
          result.COW
            .possibleOneSolTransactions
            .length > 0
        ) {
          console.log(
            `    >>> COW has ~1 SOL candidate <<<`
          );
        }

        console.log(
          `    IWA candidate mints: ` +
          result.historicalCandidates
            .IWA.length
        );

        console.log(
          `    CRIMECAT candidate mints: ` +
          result.historicalCandidates
            .CRIMECAT.length
        );

        console.log(
          `    ANSEM candidate mints: ` +
          result.historicalCandidates
            .ANSEM.length
        );

      } else {
        console.log(
          `    Not a SUBS+COW match.`
        );
      }

    } catch (error) {
      console.error(
        `    ERROR: ${error.message}`
      );

      results = results.filter(
        old => old.wallet !== wallet
      );

      results.push({
        wallet,
        error: error.message
      });
    }

    /*
      Save immediately after every wallet.
    */
    saveOutputs(results);

    console.log(
      `    Progress saved.`
    );

    await sleep(REQUEST_DELAY_MS);
  }

  saveOutputs(results);

  const matches =
    results.filter(result => result.match);

  console.log(
    `\n=======================================`
  );

  console.log(
    `FINAL SUBS + COW MATCHES: ` +
    `${matches.length}`
  );

  console.log(
    `=======================================`
  );

  matches.forEach(
    (result, index) => {
      console.log(
        `${index + 1}. ${result.wallet}`
      );

      console.log(
        `   COW ~1 SOL candidates: ` +
        result.COW
          .possibleOneSolTransactions
          .length
      );

      console.log(
        `   IWA candidates: ` +
        result.historicalCandidates
          .IWA.length
      );

      console.log(
        `   CRIMECAT candidates: ` +
        result.historicalCandidates
          .CRIMECAT.length
      );

      console.log(
        `   ANSEM candidates: ` +
        result.historicalCandidates
          .ANSEM.length
      );
    }
  );
}

main().catch(error => {
  console.error(error);

  process.exit(1);
});
