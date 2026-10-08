const fs = require('node:fs');
const { Client } = require('@solana-tracker/data-api');
const key = process.env.SOLANA_TRACKER_API_KEY;
if (!key) throw new Error('SOLANA_TRACKER_API_KEY is missing');
const client = new Client({ apiKey: key });
const mint = '6iQp3cxTYPKaHHRX3SnmuFisLdrr9DznDU6gKnQtpump';
const config = [
  { name: 'entry', type: 'buy', from: '2026-10-05T04:21:20Z', to: '2026-10-05T04:23:00Z' },
  { name: 'exit', type: 'sell', from: '2026-10-05T04:21:45Z', to: '2026-10-05T04:25:00Z' },
];
async function scan(w) {
  let cursor = Date.parse(w.from), complete = false, reason = null;
  let requests = 0, lastTime = null;
  const trades = [], seen = new Set();
  for (let i = 0; i < 3; i++) {
    const page = await client.getTokenTradeHistory(mint, {
      events: 'trades', sortDirection: 'ASC', limit: 500, cursor
    });
    requests++;
    for (const x of page.trades || []) {
      if (!Number.isFinite(x.time)) continue;
      lastTime = x.time;
      if (x.time > Date.parse(w.to)) { complete = true; break; }
      if (x.time < Date.parse(w.from) || x.type !== w.type) continue;
      const id = `${x.tx}|${x.wallet}|${x.time}|${x.amount}`;
      if (seen.has(id)) continue;
      seen.add(id);
      trades.push({ wallet: x.wallet, type: x.type, time: x.time,
        amount: x.amount, priceUsd: x.priceUsd, tx: x.tx, volumeSol: x.volumeSol });
    }
    if (complete || !page.hasNextPage) { complete = true; break; }
    const next = Number(page.nextCursor);
    if (!Number.isFinite(next) || next <= cursor) { reason = 'nonadvancing cursor'; break; }
    if (i === 2) { reason = 'page cap'; break; }
    cursor = next;
  }
  return { ...w, requests, complete, reason, lastTimeUTC: lastTime ? new Date(lastTime).toISOString() : null, trades };
}
async function main() {
  const out = { token: 'Pairstreet', mint,
    screenshot: { entryUTC: '2026-10-05T04:21:00Z', holdMinutes: 1, pnlPct: 174.3 },
    windows: [], candidates: [], note: 'Screenshot timestamp may be rounded; gross single-fill PNL, not verified net PNL.' };
  try {
    for (const w of config) out.windows.push(await scan(w));
    const sells = new Map();
    for (const s of out.windows[1].trades) {
      if (!sells.has(s.wallet)) sells.set(s.wallet, []);
      sells.get(s.wallet).push(s);
    }
    for (const b of out.windows[0].trades) for (const s of sells.get(b.wallet) || []) {
      const minutes = (s.time - b.time) / 60000;
      const ratio = s.amount / b.amount;
      if (minutes <= 0 || minutes > 3 || !(ratio >= 0.95 && ratio <= 1.05)) continue;
      const pnl = (s.amount * s.priceUsd / (b.amount * b.priceUsd) - 1) * 100;
      if (!Number.isFinite(pnl)) continue;
      out.candidates.push({ wallet: b.wallet, buyUTC: new Date(b.time).toISOString(),
        sellUTC: new Date(s.time).toISOString(), holdMinutes: +minutes.toFixed(2),
        estimatedGrossPnlPct: +pnl.toFixed(2), deviationFromScreenshot: +Math.abs(pnl - 174.3).toFixed(2),
        buyTx: b.tx, sellTx: s.tx });
    }
    out.candidates.sort((a, b) => a.deviationFromScreenshot - b.deviationFromScreenshot);
  } finally {
    out.complete = out.windows.length === 2 && out.windows.every(x => x.complete);
    out.requests = out.windows.reduce((sum, x) => sum + x.requests, 0);
    fs.writeFileSync('pairstreet-third-token.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ complete: out.complete, requests: out.requests,
      windows: out.windows.map(w => ({ name: w.name, complete: w.complete, count: w.trades.length, reason: w.reason })),
      candidateCount: out.candidates.length, top: out.candidates.slice(0, 10) }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
