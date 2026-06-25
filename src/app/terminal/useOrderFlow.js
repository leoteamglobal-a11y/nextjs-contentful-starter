'use client';

import { useState, useEffect, useRef } from 'react';

// FLOW Strategy — native order flow entries
// Detects: DOM Absorption, Delta Flip, Bid/Ask Imbalance, Iceberg
// Returns active signals with score, type, direction

const IMBALANCE_RATIO = 2.5;   // bids/asks ratio for bullish imbalance
const DELTA_FLIP_MIN  = 150;   // min delta swing to count as flip
const ABSORPTION_BARS = 3;     // price tests same level N times
const BLOCK_SIZE      = 200;   // min size for "block" trade

function calcDomImbalance(dom) {
  if (!dom) return { ratio: 1, bidTotal: 0, askTotal: 0, signal: 0 };
  const bidTotal = (dom.bids || []).slice(0, 5).reduce((a, b) => a + (b.size || 0), 0);
  const askTotal = (dom.asks || []).slice(0, 5).reduce((a, b) => a + (b.size || 0), 0);
  const ratio = askTotal > 0 ? bidTotal / askTotal : 1;
  const signal = ratio >= IMBALANCE_RATIO ? 1 : ratio <= 1 / IMBALANCE_RATIO ? -1 : 0;
  return { ratio, bidTotal, askTotal, signal };
}

function detectIceberg(dom, prev) {
  // Same large size appearing at same bid price repeatedly = hidden buyer
  if (!dom || !prev) return 0;
  let longIce = 0, shortIce = 0;
  for (const bid of (dom.bids || []).slice(0, 3)) {
    const prevBid = (prev.bids || []).find(b => b.price === bid.price);
    if (prevBid && Math.abs(bid.size - prevBid.size) < 30 && bid.size > 400) longIce++;
  }
  for (const ask of (dom.asks || []).slice(0, 3)) {
    const prevAsk = (prev.asks || []).find(a => a.price === ask.price);
    if (prevAsk && Math.abs(ask.size - prevAsk.size) < 30 && ask.size > 400) shortIce++;
  }
  return longIce >= 2 ? 1 : shortIce >= 2 ? -1 : 0;
}

export function useOrderFlow(dom, tape, price) {
  const [signal, setSignal]   = useState(null);
  const [delta, setDelta]     = useState(0);
  const [imbalance, setImbal] = useState({ ratio: 1, bidTotal: 0, askTotal: 0, signal: 0 });

  const deltaRef      = useRef(0);
  const prevDeltaRef  = useRef(0);
  const prevDomRef    = useRef(null);
  const priceHistory  = useRef([]);
  const deltaHistory  = useRef([]);

  useEffect(() => {
    if (!tape || tape.length === 0) return;

    // Update cumulative delta from latest tape entry
    const latest = tape[0];
    if (!latest) return;
    const contribution = latest.side === 'B' ? latest.size : -latest.size;
    prevDeltaRef.current = deltaRef.current;
    deltaRef.current += contribution;

    // Keep rolling window of last 100 ticks
    deltaHistory.current = [deltaRef.current, ...deltaHistory.current].slice(0, 100);
    setDelta(deltaRef.current);
  }, [tape]);

  useEffect(() => {
    if (!dom || !price) return;

    const imbal = calcDomImbalance(dom);
    setImbal(imbal);

    // Price history for absorption detection
    priceHistory.current = [price, ...priceHistory.current].slice(0, 20);

    const iceberg = detectIceberg(dom, prevDomRef.current);
    prevDomRef.current = dom;

    // --- SIGNAL DETECTION ---
    const conditions = { long: [], short: [] };
    let longScore = 0, shortScore = 0;

    // 1. DOM Imbalance (35 pts)
    if (imbal.signal === 1) {
      conditions.long.push(`DOM ${imbal.ratio.toFixed(1)}:1 bids vs asks`);
      longScore += 35;
    } else if (imbal.signal === -1) {
      conditions.short.push(`DOM ${(1/imbal.ratio).toFixed(1)}:1 asks vs bids`);
      shortScore += 35;
    }

    // 2. Delta Flip (35 pts)
    const dFlip = deltaRef.current - prevDeltaRef.current;
    if (dFlip > DELTA_FLIP_MIN && prevDeltaRef.current < 0) {
      conditions.long.push(`Delta flip +${dFlip} (negativo → positivo)`);
      longScore += 35;
    } else if (dFlip < -DELTA_FLIP_MIN && prevDeltaRef.current > 0) {
      conditions.short.push(`Delta flip ${dFlip} (positivo → negativo)`);
      shortScore += 35;
    } else if (deltaRef.current > 200) {
      conditions.long.push(`Delta acumulado positivo: +${deltaRef.current}`);
      longScore += 15;
    } else if (deltaRef.current < -200) {
      conditions.short.push(`Delta acumulado negativo: ${deltaRef.current}`);
      shortScore += 15;
    }

    // 3. Iceberg detection (20 pts)
    if (iceberg === 1) {
      conditions.long.push('Iceberg comprador detectado en DOM');
      longScore += 20;
    } else if (iceberg === -1) {
      conditions.short.push('Iceberg vendedor detectado en DOM');
      shortScore += 20;
    }

    // 4. Absorption: recent tape blocks in direction (10 pts)
    const recentBlocks = (tape || []).slice(0, 15);
    const buyBlocks  = recentBlocks.filter(t => t.side === 'B' && t.size >= BLOCK_SIZE).length;
    const sellBlocks = recentBlocks.filter(t => t.side === 'S' && t.size >= BLOCK_SIZE).length;
    if (buyBlocks >= 2) {
      conditions.long.push(`${buyBlocks} bloques compradores recientes`);
      longScore += 10;
    }
    if (sellBlocks >= 2) {
      conditions.short.push(`${sellBlocks} bloques vendedores recientes`);
      shortScore += 10;
    }

    // Determine signal
    const topScore = Math.max(longScore, shortScore);
    const dir = longScore > shortScore ? 'LONG' : 'SHORT';
    const reasons = dir === 'LONG' ? conditions.long : conditions.short;

    if (topScore >= 55 && reasons.length >= 2) {
      const grade = topScore >= 80 ? 'A+' : topScore >= 65 ? 'B' : 'C';
      setSignal({
        dir,
        score: topScore,
        grade,
        reasons,
        imbalRatio: imbal.ratio,
        delta: deltaRef.current,
        ts: Date.now(),
      });
    } else {
      setSignal(null);
    }
  }, [dom, price]);

  const resetDelta = () => { deltaRef.current = 0; prevDeltaRef.current = 0; setDelta(0); };

  return { signal, delta, imbalance, resetDelta };
}
