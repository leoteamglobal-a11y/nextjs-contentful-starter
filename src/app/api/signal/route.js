import { pushSignal } from './store';

// TradingView webhook sends:
// "LONG EP 21450.25 | SL 21420.00 | TP1 21510.75 | TP2 21600.50"
// or "SHORT EP 21450.25 | SL 21480.00 | TP1 21390.50 | TP2 21300.25"
function parseAlert(text) {
  const dir = text.startsWith('LONG') ? 'LONG' : text.startsWith('SHORT') ? 'SHORT' : null;
  if (!dir) return null;

  const ep  = parseFloat(text.match(/EP\s+([\d.]+)/)?.[1]);
  const sl  = parseFloat(text.match(/SL\s+([\d.]+)/)?.[1]);
  const tp1 = parseFloat(text.match(/TP1\s+([\d.]+)/)?.[1]);
  const tp2 = parseFloat(text.match(/TP2\s+([\d.]+)/)?.[1]);
  const aplus = text.includes('A+');
  const flip = text.includes('FLIP');

  if (!ep || !sl) return null;
  return { dir, ep, sl, tp1, tp2, aplus, flip, ts: Date.now(), raw: text };
}

export async function POST(req) {
  const body = await req.text();
  const signal = parseAlert(body.trim());

  if (!signal) {
    return Response.json({ error: 'Could not parse signal' }, { status: 400 });
  }

  pushSignal(signal);
  return Response.json({ ok: true, signal });
}

export async function GET() {
  return Response.json({ ok: true, msg: 'POST here from TradingView alerts' });
}
