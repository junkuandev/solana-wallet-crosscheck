const fs = require('fs');

const API_KEY = process.env.HELIUS_API_KEY;

if (!API_KEY) {
  throw new Error('HELIUS_API_KEY is missing');
}

const TOKENS = {
  BOAR: 'Hk8Uiq8CeNdmZzu1aPaT7MhvujtJifFS9kKhfpXmpaid',
  INU:  'Wb33GwzjQLvvVhV2XB3YonQZQFM9zhXiU7AZB931Uts'
};

const WSOL = 'So11111111111111111111111111111111111111112';

const wallets = [
  "G149TbJYsqHdvXL8dnmnA8FSXA8Wa1MpDzNhiMaU5G6V",
  "5aLY85pyxiuX3fd4RgM3Yc1e3MAL6b7UgaZz6MS3JUfG",
  "Finr5rgQ4B4oZxAfjpA61Cpw77ZJG73FHv9X8mqdZiL6",
  "M4bkCxRTRFWQratny1jp8TMBLTgzrWyYvLUYdz55U6a",
  "c4NP5jNTQG3HcPysz8xGhwKK83D6SY85qcWwvj5iiZg",
  "FKkZnvsCd49Cc6xxfURvMpbzYFRwLvdfaKHWDMhvS6dE",
  "22KzhxjiE2ifT6Wxeq86x28Gb5KGzH7tw92nQRNseUdB",
  "98kZRZjySM1GLskR3nWN9x82MMYJQDRQ9CbgEgCQetLt",
  "5WJUmLt65USC7SCWxKrFkHtqcBeGdUesckGyz4SrhSv6",
  "7BNaxx6KdUYrjACNQZ9He26NBFoFxujQMAfNLnArLGH5",
  "8zkgFGVZrDLieViwqiXFCydSX6WL5hsxmUu55yBdsNsZ",
  "4MJyL4FPCaLuVH4veoJeuaJ1bcPuvcps5w8opceYActZ",
  "7w3R4u6YtWgMcMZ8EjBeDqbKYJREdWhC3wszzpt25BGh",
  "A32Nozc9zNVsQj3ja4NFmoeFRg4n8K27YCm7N1v3A1x2",
  "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
  "kEFiAX3jo5NmemysQov342TZ9mGh6yp92GDRjhA8XDf",
  "AeBgCFnkSWMAwv3zjaJPB93hxEBUEVkhEyKVFaxT84pJ",
  "4FLwUkZxyDXDbHKJFF4sXiudNTQmWaxpqpwcybLZmUn4",
  "C68cHHnJJT7yAT7infgQXWsAWiccNczYDLRG2bRUfyqt",
  "46J4AqEFjuTifUMBR8KH1xqUf7nJnRb4ARnC4HmYf6vN",
  "DZbgq3yE3r41EFszV3XastvyS8j8QnmNT37nsq7sxR66",
  "BEvw9mQbfQwbnQKy4XJQuxDbADuJMAhKaUVtdjj4fz8N",
  "3LfX4Nm7ipyPs6p5jUEqdMpAihTchz9x6URjB9Dyk8L3",
  "BLtpLryrbYCxA1dteSq1qwkLAfT8ogYLrPKzojhKhwUg",
  "NULLioEUhd89Jo5Acm9sX88bwjNjrsAVy6KWkXD7qZh",
  "8wqG3jQzm2RBLeVimNLwpcHjbr25yz1DzmMWUTFY9wfR",
  "EJeqL8qJRZZ1wAYK95zufwzDXYJpwQecP8a6Wb5x8Rfn"
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function ts(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/*
  Snapshot clues, all PHT / UTC+8.

  BOAR:
  screenshot Sep 16 8:50 AM
  entry could have been hours earlier.

  INU:
  screenshot Sep 21 8:04 AM
  PnL card shows ~1.51 SOL initial position.
*/

const WINDOWS = {
  BOAR: {
    start: ts('2026-09-15T08:00:00+08:00'),
    end:   ts('2026-09-16T08:50:00+08:00')
  },

  INU: {
    start: ts('2026-09-20T08:00:00+08:00'),
    end:   ts('2026-09-21T08:04:00+08:00')
  }
};

/*
  Broad total history boundary.
  We only need Sep 15 onward for BOAR/INU.
*/
const SEARCH_START =
  ts('2026-09-15T00:00:00+08:00');

const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 700;
const EMERGENCY_MAX_PAGES = 1000;

/*
  INU entry target:
  PnL card says 1.51 SOL.

  Give it tolerance because:
  - cards may round
  - fees may be excluded/included
  - trade can be split
*/
const INU_TARGET_SOL = 1.51;
const INU_MIN_SOL = 1.35;
const INU_MAX_SOL = 1.70;

function inRange(value, start, end) {
  return value >= start && value <= end;
}

function txHasMint(tx, mint) {
  const transferMatch =
    (tx.tokenTransfers || []).some(
      t => t.mint === mint
    );

  if (transferMatch) return true;

  const accountDataMatch =
    (tx.accountData || []).some(account =>
      (account.tokenBalanceChanges || []).some(
        change => change.mint === mint
      )
    );

  return accountDataMatch;
}

function getMints(tx) {
  return [
    ...new Set(
      (tx.tokenTransfers || [])
        .map(t => t.mint)
        .filter(Boolean)
    )
  ];
}

/*
  Returns WSOL token-transfer values associated
  with the wallet itself.

  This is better than blindly reading every WSOL
  transfer in a routed transaction.
*/
function getWalletWsolFlows(tx, wallet) {
  const outgoing = [];
  const incoming = [];

  for (const t of tx.tokenTransfers || []) {
    if (t.mint !== WSOL) continue;

    const amount = Number(t.tokenAmount);

    if (!Number.isFinite(amount)) continue;

    if (t.fromUserAccount === wallet) {
      outgoing.push(amount);
    }

    if (t.toUserAccount === wallet) {
      incoming.push(amount);
    }
  }

  return {
    outgoing,
    incoming
  };
}

/*
  Native SOL transfers can also reveal the effective
  amount spent, especially with Pump transactions.
*/
function getWalletNativeSolFlows(tx, wallet) {
  const outgoing = [];
  const incoming = [];

  for (const t of tx.nativeTransfers || []) {
    const amountSOL =
      Number(t.amount) / 1_000_000_000;

    if (!Number.isFinite(amountSOL)) continue;

    if (t.fromUserAccount === wallet) {
      outgoing.push(amountSOL);
    }

    if (t.toUserAccount === wallet) {
      incoming.push(amountSOL);
    }
  }

  return {
    outgoing,
    incoming
  };
}

/*
  Guess the main SOL entry amount.

  We use the largest wallet-originating WSOL transfer
  first. If not present, use largest native SOL outflow.

  This avoids treating tiny routing/fee transfers as
  the main purchase.
*/
function estimateSolSpent(tx, wallet) {
  const wsol =
    getWalletWsolFlows(tx, wallet);

  const native =
    getWalletNativeSolFlows(tx, wallet);

  const candidates = [
    ...wsol.outgoing,
    ...native.outgoing
  ].filter(x => x > 0);

  if (!candidates.length) {
    return null;
  }

  return Math.max(...candidates);
}

function simplifyTx(tx, wallet) {
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

    estimatedSolSpent:
      estimateSolSpent(tx, wallet),

    mints: getMints(tx),

    tokenTransfers:
      tx.tokenTransfers || [],

    nativeTransfers:
      tx.nativeTransfers || []
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
    no type=SWAP filter.

    We want every parsed transaction type
    so we don't miss Pump/bonding-curve activity.
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

      let waitMs;

      if (
        Number.isFinite(retryAfter) &&
        retryAfter > 0
      ) {
        waitMs =
          retryAfter * 1000;
      } else {
        waitMs =
          Math.min(
            1000 * 2 ** (attempt - 1),
            60000
          );

        waitMs *=
          0.8 + Math.random() * 0.4;
      }

      console.log(
        `    HTTP ${response.status}. ` +
        `Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `Helius HTTP ${response.status}: ` +
        body.slice(0, 500)
      );
    }

    return response.json();
  }

  throw new Error(
    'Helius failed after maximum retries'
  );
}

async function scanWallet(wallet) {
  let before = null;

  let pagesScanned = 0;
  let transactionsChecked = 0;

  const boarTxs = [];
  const inuTxs = [];

  for (
    let page = 1;
    page <= EMERGENCY_MAX_PAGES;
    page++
  ) {
    const txs =
      await fetchPage(
        wallet,
        before
      );

    pagesScanned++;

    if (!txs.length) {
      console.log(
        '    No older transactions.'
      );

      break;
    }

    transactionsChecked +=
      txs.length;

    let oldest =
      Infinity;

    for (const tx of txs) {
      if (!tx.timestamp) continue;

      oldest =
        Math.min(
          oldest,
          tx.timestamp
        );

      /*
        BOAR
      */
      if (
        inRange(
          tx.timestamp,
          WINDOWS.BOAR.start,
          WINDOWS.BOAR.end
        ) &&
        txHasMint(
          tx,
          TOKENS.BOAR
        )
      ) {
        boarTxs.push(
          simplifyTx(
            tx,
            wallet
          )
        );
      }

      /*
        INU
      */
      if (
        inRange(
          tx.timestamp,
          WINDOWS.INU.start,
          WINDOWS.INU.end
        ) &&
        txHasMint(
          tx,
          TOKENS.INU
        )
      ) {
        inuTxs.push(
          simplifyTx(
            tx,
            wallet
          )
        );
      }
    }

    const oldestPHT =
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
      `    Page ${page} | ` +
      `${txs.length} tx | ` +
      `oldest ${oldestPHT} | ` +
      `BOAR=${boarTxs.length} | ` +
      `INU=${inuTxs.length}`
    );

    /*
      Once we are older than Sep 15 midnight,
      we've fully covered both search windows.
    */
    if (
      Number.isFinite(oldest) &&
      oldest < SEARCH_START
    ) {
      console.log(
        '    Reached historical cutoff.'
      );

      break;
    }

    if (
      txs.length <
      PAGE_SIZE
    ) {
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

  /*
    Check INU entry around 1.51 SOL.
  */
  const inuApproxEntryTxs =
    inuTxs.filter(tx => {
      const amount =
        tx.estimatedSolSpent;

      return (
        Number.isFinite(amount) &&
        amount >= INU_MIN_SOL &&
        amount <= INU_MAX_SOL
      );
    });

  return {
    wallet,

    BOAR: {
      found:
        boarTxs.length > 0,

      transactions:
        boarTxs
    },

    INU: {
      found:
        inuTxs.length > 0,

      transactions:
        inuTxs,

      approx151SolEntry:
        inuApproxEntryTxs.length > 0,

      approx151SolTransactions:
        inuApproxEntryTxs
    },

    hardMatch:
      boarTxs.length > 0 &&
      inuTxs.length > 0,

    strongMatch:
      boarTxs.length > 0 &&
      inuApproxEntryTxs.length > 0,

    pagesScanned,
    transactionsChecked
  };
}

function saveOutputs(results) {
  const hardMatches =
    results.filter(
      r => r.hardMatch
    );

  const strongMatches =
    results.filter(
      r => r.strongMatch
    );

  fs.writeFileSync(
    'results.json',
    JSON.stringify(
      results,
      null,
      2
    )
  );

  fs.writeFileSync(
    'hard-matches.json',
    JSON.stringify(
      hardMatches,
      null,
      2
    )
  );

  fs.writeFileSync(
    'strong-matches.json',
    JSON.stringify(
      strongMatches,
      null,
      2
    )
  );

  fs.writeFileSync(
    'strong-matches.txt',
    strongMatches
      .map(r => r.wallet)
      .join('\n')
  );

  const csv = [
    [
      'wallet',
      'BOAR',
      'INU',
      'INU_approx_1_51_SOL',
      'hard_match',
      'strong_match',
      'pages_scanned',
      'transactions_checked'
    ].join(','),

    ...results.map(r =>
      [
        r.wallet,
        r.BOAR?.found
          ? 'YES'
          : 'NO',
        r.INU?.found
          ? 'YES'
          : 'NO',
        r.INU
          ?.approx151SolEntry
          ? 'YES'
          : 'NO',
        r.hardMatch
          ? 'YES'
          : 'NO',
        r.strongMatch
          ? 'YES'
          : 'NO',
        r.pagesScanned ?? '',
        r.transactionsChecked ?? ''
      ].join(',')
    )
  ];

  fs.writeFileSync(
    'summary.csv',
    csv.join('\n')
  );
}

async function main() {
  let results = [];

  if (
    fs.existsSync(
      'results.json'
    )
  ) {
    try {
      results =
        JSON.parse(
          fs.readFileSync(
            'results.json',
            'utf8'
          )
        );

      console.log(
        `Loaded ${results.length} existing result(s).`
      );
    } catch {
      console.log(
        'Old results.json could not be parsed. Starting fresh.'
      );
    }
  }

  for (
    let i = 0;
    i < wallets.length;
    i++
  ) {
    const wallet =
      wallets[i];

    const previous =
      results.find(
        r =>
          r.wallet === wallet &&
          !r.error
      );

    if (previous) {
      console.log(
        `[${i + 1}/${wallets.length}] Already scanned: ${wallet}`
      );

      continue;
    }

    console.log(
      `\n================================`
    );

    console.log(
      `[${i + 1}/${wallets.length}] ${wallet}`
    );

    console.log(
      `================================`
    );

    try {
      const result =
        await scanWallet(
          wallet
        );

      results =
        results.filter(
          r =>
            r.wallet !== wallet
        );

      results.push(
        result
      );

      console.log(
        `    BOAR: ${
          result.BOAR.found
            ? 'YES'
            : 'NO'
        }`
      );

      console.log(
        `    INU: ${
          result.INU.found
            ? 'YES'
            : 'NO'
        }`
      );

      console.log(
        `    INU ~1.51 SOL: ${
          result.INU
            .approx151SolEntry
            ? 'YES'
            : 'NO'
        }`
      );

      if (
        result.strongMatch
      ) {
        console.log(
          `\n    >>> STRONG MATCH <<<`
        );

        console.log(
          `    ${wallet}`
        );
      } else if (
        result.hardMatch
      ) {
        console.log(
          `\n    >>> BOAR + INU MATCH <<<`
        );
      }

    } catch (error) {
      console.error(
        `    ERROR: ${
          error.message
        }`
      );

      results =
        results.filter(
          r =>
            r.wallet !== wallet
        );

      results.push({
        wallet,
        error:
          error.message
      });
    }

    saveOutputs(
      results
    );

    console.log(
      '    Progress saved.'
    );

    await sleep(
      REQUEST_DELAY_MS
    );
  }

  saveOutputs(
    results
  );

  const hard =
    results.filter(
      r => r.hardMatch
    );

  const strong =
    results.filter(
      r => r.strongMatch
    );

  console.log(
    '\n================================'
  );

  console.log(
    `BOAR + INU matches: ${hard.length}`
  );

  console.log(
    `Strong ~1.51 SOL matches: ${strong.length}`
  );

  console.log(
    '================================'
  );

  strong.forEach(
    (r, i) => {
      console.log(
        `${i + 1}. ${r.wallet}`
      );

      for (
        const tx of
        r.INU
          .approx151SolTransactions
      ) {
        console.log(
          `   INU ${tx.datePHT} | ` +
          `estimated ${tx.estimatedSolSpent} SOL`
        );
      }
    }
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
