const API_KEY = process.env.HELIUS_API_KEY;

const wallet =
  'AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51';

const url =
  `https://api.helius.xyz/v0/addresses/${wallet}/transactions` +
  `?api-key=${API_KEY}&limit=100&type=SWAP`;

async function main() {
  const response = await fetch(url);

  console.log('HTTP:', response.status);

  const data = await response.json();

  if (!response.ok) {
    console.log(data);
    return;
  }

  console.log(`Transactions returned: ${data.length}`);

  if (data.length) {
    console.log('First transaction:');
    console.dir(data[0], { depth: null });
  }
}

main();
