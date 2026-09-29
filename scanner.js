const fs = require('fs');

const API_KEY = process.env.HELIUS_API_KEY;

if (!API_KEY) {
  throw new Error('HELIUS_API_KEY is missing');
}

const TOKENS = {
  SUBS: 'BW1HeTnP1ZpSyvoExMKCW86vdEAShjwBV6dUfgZwpump',
  COW: 'CUh9nnRSojHHdLWzVQQ2rZBmnq66zLg8TfcuQUyy6BLr'
};

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/*
 * Maximum pages per wallet.
 *
 * 100 SWAP transactions/page means 100 pages = up to 10,000 swaps.
 * We stop much earlier as soon as BOTH tokens are found.
 */
const MAX_PAGES = 100;
const REQUEST_DELAY_MS = 500;

async function fetchPage(wallet, before = null) {
  const url = new URL(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
  );

  url.searchParams.set('api-key', API_KEY);
  url.searchParams.set('limit', '100');
  url.searchParams.set('type', 'SWAP');

  if (before) {
    url.searchParams.set('before', before);
  }

  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await fetch(url);

    if (response.status === 429 || response.status === 503) {
      const retryHeader = response.headers.get('retry-after');

      let waitMs;

      if (retryHeader && !Number.isNaN(Number(retryHeader))) {
        waitMs = Number(retryHeader) * 1000;
      } else {
        // 1s, 2s, 4s, 8s, 16s, max 30s
        waitMs = Math.min(1000 * (2 ** (attempt - 1)), 30000);

        // Small jitter so repeated retries don't align exactly.
        waitMs *= 0.75 + Math.random() * 0.5;
      }

      console.log(
        `    HTTP ${response.status}. Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Helius HTTP ${response.status}: ${body.slice(0, 300)}`
      );
    }

    return response.json();
  }

  throw new Error('Helius failed after maximum retries');
}

function transactionContainsMint(tx, mint) {
  return (tx.tokenTransfers || []).some(
    transfer => transfer.mint === mint
  );
}

async function scanWallet(wallet) {
  let before = null;

  const subsTransactions = [];
  const cowTransactions = [];

  let pagesScanned = 0;
  let swapsScanned = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const transactions = await fetchPage(wallet, before);

    pagesScanned++;
    swapsScanned += transactions.length;

    if (!transactions.length) {
      break;
    }

    for (const tx of transactions) {
      if (transactionContainsMint(tx, TOKENS.SUBS)) {
        subsTransactions.push(tx);
      }

      if (transactionContainsMint(tx, TOKENS.COW)) {
        cowTransactions.push(tx);
      }
    }

    console.log(
      `    Page ${page}: ${transactions.length} swaps | ` +
      `SUBS=${subsTransactions.length} | COW=${cowTransactions.length}`
    );

    /*
     * Our immediate goal is only finding wallets that traded BOTH.
     * Once both have been found, there is no reason to consume more
     * Helius credits on this wallet during the first pass.
     */
    if (
      subsTransactions.length > 0 &&
      cowTransactions.length > 0
    ) {
      break;
    }

    if (transactions.length < 100) {
      // We reached the oldest available SWAP transaction.
      break;
    }

    const lastTransaction = transactions[transactions.length - 1];

    if (!lastTransaction?.signature) {
      break;
    }

    before = lastTransaction.signature;

    await sleep(REQUEST_DELAY_MS);
  }

  return {
    wallet,
    subs: subsTransactions.length > 0,
    cow: cowTransactions.length > 0,
    both:
      subsTransactions.length > 0 &&
      cowTransactions.length > 0,

    subsTransactions,
    cowTransactions,

    pagesScanned,
    swapsScanned
  };
}

function saveFiles(results) {
  fs.writeFileSync(
    'results.json',
    JSON.stringify(results, null, 2)
  );

  const matches = results.filter(result => result.both);

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

  const csv = [
    'wallet,SUBS,COW,both,SUBS_transactions,COW_transactions,pages_scanned,swaps_scanned',

    ...results.map(result =>
      [
        result.wallet,
        result.subs ? 'YES' : 'NO',
        result.cow ? 'YES' : 'NO',
        result.both ? 'YES' : 'NO',
        result.subsTransactions?.length ?? 0,
        result.cowTransactions?.length ?? 0,
        result.pagesScanned ?? '',
        result.swapsScanned ?? ''
      ].join(',')
    )
  ].join('\n');

  fs.writeFileSync('results.csv', csv);
}

async function main() {
  let results = [];

  /*
   * If results.json exists, don't redo wallets that were
   * successfully completed during this same runner/session.
   */
  if (fs.existsSync('results.json')) {
    try {
      results = JSON.parse(
        fs.readFileSync('results.json', 'utf8')
      );

      console.log(
        `Loaded ${results.length} previous result(s).`
      );
    } catch {
      console.log(
        'Could not read previous results.json. Starting fresh.'
      );
    }
  }

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];

    const previous = results.find(
      result =>
        result.wallet === wallet &&
        !result.error
    );

    if (previous) {
      console.log(
        `[${i + 1}/${wallets.length}] Already scanned: ${wallet}`
      );

      continue;
    }

    console.log(
      `\n[${i + 1}/${wallets.length}] Scanning ${wallet}`
    );

    try {
      const result = await scanWallet(wallet);

      results = results.filter(
        existing => existing.wallet !== wallet
      );

      results.push(result);

      if (result.both) {
        console.log(
          `    >>> MATCH — TRADED BOTH <<<`
        );
      } else {
        console.log(
          `    Finished: SUBS=${result.subs ? 'YES' : 'NO'}, ` +
          `COW=${result.cow ? 'YES' : 'NO'}`
        );
      }

    } catch (error) {
      console.error(
        `    ERROR: ${error.message}`
      );

      results = results.filter(
        existing => existing.wallet !== wallet
      );

      results.push({
        wallet,
        error: error.message
      });
    }

    /*
     * Save after EVERY wallet.
     */
    saveFiles(results);

    await sleep(REQUEST_DELAY_MS);
  }

  saveFiles(results);

  const matches = results.filter(result => result.both);

  console.log('\n================================');
  console.log(`WALLETS THAT TRADED BOTH: ${matches.length}`);
  console.log('================================');

  matches.forEach((result, i) => {
    console.log(`${i + 1}. ${result.wallet}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
