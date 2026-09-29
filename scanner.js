const fs = require('fs');

const API_KEY = process.env.SOLSCAN_API_KEY;

if (!API_KEY) {
  throw new Error('SOLSCAN_API_KEY is missing');
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

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function containsToken(row, mint) {
  const routers = Array.isArray(row.routers)
    ? row.routers
    : row.routers
      ? [row.routers]
      : [];

  for (const router of routers) {
    if (
      router.token1 === mint ||
      router.token2 === mint
    ) {
      return true;
    }

    if (Array.isArray(router.child_routers)) {
      const found = router.child_routers.some(child =>
        child.token1 === mint ||
        child.token2 === mint
      );

      if (found) return true;
    }
  }

  return false;
}

async function request(wallet, mint) {
  const url = new URL(
    'https://pro-api.solscan.io/playground/account/defi/activities'
  );

  url.searchParams.set('address', wallet);
  url.searchParams.set('token', mint);

  url.searchParams.append(
    'activity_type[]',
    'ACTIVITY_TOKEN_SWAP'
  );

  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '100');
  url.searchParams.set('sort_by', 'block_time');
  url.searchParams.set('sort_order', 'asc');

  let attempt = 0;

  while (attempt < 10) {
    attempt++;

    const response = await fetch(url, {
      headers: {
        token: API_KEY
      }
    });

    /*
      Respect Solscan's free-tier throttling.

      If a Retry-After header exists, use it.
      Otherwise progressively wait longer.
    */
    if (response.status === 429) {
      const retryAfter =
        Number(response.headers.get('retry-after'));

      const waitSeconds =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : Math.min(60 * attempt, 600);

      console.log(
        `429 rate limit. Waiting ${waitSeconds}s...`
      );

      await sleep(waitSeconds * 1000);
      continue;
    }

    const json = await response.json();

    if (!json.success) {
      throw new Error(
        `${json.errors?.code || ''} ${
          json.errors?.message || 'API error'
        }`
      );
    }

    const activities = (json.data || []).filter(row =>
      containsToken(row, mint)
    );

    return {
      traded: activities.length > 0,
      count: activities.length,
      activities
    };
  }

  throw new Error('Rate limited after 10 retries');
}

async function main() {
  const results = [];

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];

    console.log(
      `\n[${i + 1}/${wallets.length}] ${wallet}`
    );

    try {
      console.log('Checking SUBS...');

      const subs = await request(
        wallet,
        TOKENS.SUBS
      );

      console.log(
        `SUBS: ${subs.traded ? 'YES' : 'NO'}`
      );

      if (!subs.traded) {
        results.push({
          wallet,
          subs: false,
          cow: false,
          both: false,
          subsSwaps: 0,
          cowSwaps: 0
        });

        // Long delay to protect free API allowance.
        await sleep(20000);

        continue;
      }

      await sleep(20000);

      console.log('Checking COW...');

      const cow = await request(
        wallet,
        TOKENS.COW
      );

      const both =
        subs.traded &&
        cow.traded;

      console.log(
        `COW: ${cow.traded ? 'YES' : 'NO'}`
      );

      if (both) {
        console.log(
          `*** MATCH: ${wallet} ***`
        );
      }

      results.push({
        wallet,
        subs: subs.traded,
        cow: cow.traded,
        both,
        subsSwaps: subs.count,
        cowSwaps: cow.count,
        subsActivities: subs.activities,
        cowActivities: cow.activities
      });

    } catch (error) {
      console.error(
        `ERROR: ${wallet}`,
        error.message
      );

      results.push({
        wallet,
        error: error.message
      });
    }

    /*
      20-second delay between wallets.
      Increase this if Solscan still throttles.
    */
    await sleep(20000);

    /*
      Save progress after every wallet.
      This means partial results survive if the
      job eventually fails.
    */
    fs.writeFileSync(
      'results.json',
      JSON.stringify(results, null, 2)
    );
  }

  const matches =
    results.filter(result => result.both);

  const csvRows = [
    [
      'wallet',
      'SUBS',
      'COW',
      'both',
      'SUBS_swaps',
      'COW_swaps'
    ].join(',')
  ];

  for (const result of results) {
    csvRows.push([
      result.wallet,
      result.subs ? 'YES' : 'NO',
      result.cow ? 'YES' : 'NO',
      result.both ? 'YES' : 'NO',
      result.subsSwaps ?? '',
      result.cowSwaps ?? ''
    ].join(','));
  }

  fs.writeFileSync(
    'results.csv',
    csvRows.join('\n')
  );

  fs.writeFileSync(
    'matches.txt',
    matches
      .map(result => result.wallet)
      .join('\n')
  );

  fs.writeFileSync(
    'matches.json',
    JSON.stringify(matches, null, 2)
  );

  console.log('\n=======================');
  console.log(
    `MATCHES: ${matches.length}`
  );
  console.log('=======================');

  matches.forEach(result =>
    console.log(result.wallet)
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
