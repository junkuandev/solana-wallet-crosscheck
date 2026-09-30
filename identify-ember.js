// EMBER candidate metadata: DexScreener, then Metaplex on-chain fallback.
// Does not use Helius. All timestamps and buys come from existing evidence.
const fs = require("fs");
const {PublicKey} = require("@solana/web3.js");
const candidates = JSON.parse(fs.readFileSync("ember-reverse-candidates.json", "utf8"));
const mints = [...new Set(candidates.map(x => x.mint).filter(Boolean))];
const metadata = new Map();
const diagnostics = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function save() {
  const enriched = candidates.map(c => {
    const info = metadata.get(c.mint);
    return {...c, name: info?.name || "", symbol: info?.symbol || "",
      metadataFound: !!info?.name || !!info?.symbol,
      metadataSource: info?.source || "unresolved"};
  });
  const matches = enriched.filter(x => /ember/i.test(x.name + " " + x.symbol));
  fs.writeFileSync("ember-identified.json", JSON.stringify(enriched, null, 2));
  fs.writeFileSync("ember-name-matches.json", JSON.stringify(matches, null, 2));
  fs.writeFileSync("ember-identification-status.json", JSON.stringify({
    totalMints: mints.length,
    identifiedMints: mints.filter(m => metadata.has(m)).length,
    unresolvedMints: mints.filter(m => !metadata.has(m)),
    issues: Object.fromEntries(diagnostics),
    emberMatches: matches.length,
    note: "Unresolved does not mean the token is not EMBER. Metadata may have been unavailable or RPC rate-limited."
  }, null, 2));
}

async function requestJson(url, opts, description) {
  for (let a = 0; a < 7; a++) {
    let response;
    try { response = await fetch(url, opts); }
    catch (e) {
      console.warn(description, "network:", e.message);
      await sleep(Math.min(2000 * 2 ** a, 30000));
      continue;
    }
    const raw = await response.text();
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      const after = Number(response.headers.get("retry-after"));
      const ms = Number.isFinite(after) && after > 0
        ? Math.min(after * 1000, 60000) : Math.min(2000 * 2 ** a, 30000);
      console.warn(description, "HTTP", response.status, raw.slice(0, 180), "retry", ms);
      await sleep(ms);
      continue;
    }
    if (!response.ok) throw Error(description + " HTTP " + response.status + ": " + raw.slice(0, 200));
    try { return JSON.parse(raw); }
    catch { throw Error(description + ": invalid JSON response"); }
  }
  throw Error(description + ": retries exhausted");
}

function metaplexNameSymbol(base64) {
  // Metaplex Metadata V1: key(1), updateAuthority(32), mint(32),
  // then Borsh name:string and symbol:string.
  const buf = Buffer.from(base64, "base64");
  let offset = 65;
  function readString() {
    if (offset + 4 > buf.length) throw Error("Truncated string length");
    const n = buf.readUInt32LE(offset);
    offset += 4;
    if (n > 256 || offset + n > buf.length) throw Error("Invalid string length");
    const value = buf.subarray(offset, offset + n).toString("utf8").replace(/\0/g, "").trim();
    offset += n;
    return value;
  }
  const name = readString();
  const symbol = readString();
  return {name, symbol, source:"metaplex-onchain"};
}

async function dexScreener() {
  for (let i = 0; i < mints.length; i += 25) {
    const batch = mints.slice(i, i + 25);
    try {
      const pairs = await requestJson(
        "https://api.dexscreener.com/tokens/v1/solana/" + batch.join(","),
        {headers:{Accept:"application/json"}}, "DexScreener");
      if (!Array.isArray(pairs)) throw Error("Unexpected pair response");
      const wanted = new Set(batch);
      for (const pair of pairs) {
        for (const token of [pair.baseToken, pair.quoteToken]) {
          if (token?.address && wanted.has(token.address) && !metadata.has(token.address)
              && (token.name || token.symbol)) {
            metadata.set(token.address, {name:token.name || "", symbol:token.symbol || "",
              source:"dexscreener"});
          }
        }
      }
    } catch (e) {
      console.warn("DexScreener batch", i, e.message);
      diagnostics.set("dex_batch_"+i, e.message);
    }
    save();
    console.log("DexScreener:", Math.min(i + 25, mints.length), "/", mints.length);
    await sleep(700);
  }
}

async function onChainFallback() {
  const missing = mints.filter(m => !metadata.has(m));
  console.log("Unresolved after DexScreener:", missing.length);
  for (let i = 0; i < missing.length; i += 10) {
    const group = missing.slice(i, i + 10);
    const valid = [];
    for (const mint of group) {
      try {
        const addr = new PublicKey(mint);
        const pda = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), PROGRAM.toBuffer(), addr.toBuffer()], PROGRAM)[0];
        valid.push({mint, pda:pda.toBase58()});
      } catch (e) { diagnostics.set(mint, "Invalid mint: " + e.message); }
    }
    if (!valid.length) continue;
    try {
      const json = await requestJson(RPC, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          jsonrpc:"2.0", id: i + 1, method:"getMultipleAccounts",
          params:[valid.map(v => v.pda), {encoding:"base64", commitment:"confirmed"}]
        })
      }, "Solana RPC");
      if (json.error) throw Error(JSON.stringify(json.error));
      const accounts = json?.result?.value;
      if (!Array.isArray(accounts) || accounts.length !== valid.length) {
        throw Error("Unexpected RPC account result");
      }
      accounts.forEach((account, j) => {
        if (!account?.data?.[0]) {diagnostics.set(valid[j].mint, "No Metaplex account returned"); return;}
        try {
          const info = metaplexNameSymbol(account.data[0]);
          if (info.name || info.symbol) metadata.set(valid[j].mint, info);
        } catch (e) { diagnostics.set(valid[j].mint, e.message); }
      });
    } catch (e) {
      console.warn("RPC batch", i, e.message);
      diagnostics.set("rpc_batch_"+i, e.message);
    }
    save();
    console.log("On-chain checked", Math.min(i+10,missing.length), "/", missing.length);
    await sleep(1400);
  }
}

async function main() {
  save();
  await dexScreener();
  await onChainFallback();
  save();
  const matches = JSON.parse(fs.readFileSync("ember-name-matches.json","utf8"));
  console.log("Found EMBER-name candidate purchases:",matches.length);
  console.table(matches.slice(0,30).map(x => ({
    wallet:x.wallet.slice(0,10), name:x.name, symbol:x.symbol,
    sol:x.sol, date:x.datePHT, source:x.metadataSource
  })));
}
main().catch(e=>{save(); console.error(e); process.exitCode=1;});