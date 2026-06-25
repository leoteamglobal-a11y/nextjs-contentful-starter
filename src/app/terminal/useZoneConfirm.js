'use client';

import { useState, useEffect, useRef } from 'react';

// Analyzes DOM + tape to score a zone signal
// Returns: { score: 0-100, color: 'green'|'yellow'|'red', reasons: [] }

export function useZoneConfirm(signal, dom, tape) {
  const [confirm, setConfirm] = useState(null);
  const tapeWindow = useRef([]);

  useEffect(() => {
    if (!signal || !dom) { setConfirm(null); return; }

    const reasons = [];
    let score = 0;
    const isLong = signal.dir === 'LONG';
    const ep = signal.ep;
    const sl = signal.sl;
    const zoneRange = Math.abs(ep - sl);

    // --- 1. DOM WALL near zone (30 pts) ---
    const bookSide = isLong ? dom.bids : dom.asks;
    if (bookSide && bookSide.length > 0) {
      const nearLevels = bookSide.filter(lvl => Math.abs(lvl.price - (isLong ? sl : sl)) <= zoneRange * 1.5);
      const wallSize = nearLevels.reduce((a, b) => a + (b.size || 0), 0);
      if (wallSize >= 800) {
        score += 30;
        reasons.push(`Pared ${isLong ? 'bid' : 'ask'} fuerte: ${wallSize} contratos`);
      } else if (wallSize >= 400) {
        score += 15;
        reasons.push(`Pared ${isLong ? 'bid' : 'ask'} media: ${wallSize} contratos`);
      } else {
        reasons.push(`Pared débil: ${wallSize} contratos`);
      }
    }

    // --- 2. TAPE DELTA in last 20 ticks (40 pts) ---
    const recent = tape.slice(0, 20);
    const buyVol = recent.filter(t => t.side === 'B').reduce((a, t) => a + t.size, 0);
    const sellVol = recent.filter(t => t.side === 'S').reduce((a, t) => a + t.size, 0);
    const delta = buyVol - sellVol;
    const totalVol = buyVol + sellVol;
    const deltaRatio = totalVol > 0 ? delta / totalVol : 0;

    if (isLong) {
      if (deltaRatio > 0.2) {
        score += 40;
        reasons.push(`Delta positivo: +${delta} (compradores dominan)`);
      } else if (deltaRatio > 0) {
        score += 20;
        reasons.push(`Delta levemente positivo: +${delta}`);
      } else {
        reasons.push(`Delta negativo: ${delta} (vendedores dominan)`);
      }
    } else {
      if (deltaRatio < -0.2) {
        score += 40;
        reasons.push(`Delta negativo: ${delta} (vendedores dominan)`);
      } else if (deltaRatio < 0) {
        score += 20;
        reasons.push(`Delta levemente negativo: ${delta}`);
      } else {
        reasons.push(`Delta positivo: +${delta} (compradores dominan)`);
      }
    }

    // --- 3. BLOCK TRADES near zone (30 pts) ---
    const blocks = recent.filter(t => t.size >= 200 && t.side === (isLong ? 'B' : 'S'));
    if (blocks.length >= 3) {
      score += 30;
      reasons.push(`${blocks.length} bloques grandes ${isLong ? 'compradores' : 'vendedores'} en zona`);
    } else if (blocks.length >= 1) {
      score += 15;
      reasons.push(`${blocks.length} bloque grande ${isLong ? 'comprador' : 'vendedor'}`);
    } else {
      reasons.push(`Sin bloques grandes ${isLong ? 'compradores' : 'vendedores'}`);
    }

    const color = score >= 65 ? 'green' : score >= 35 ? 'yellow' : 'red';
    const label = score >= 65 ? 'CONFIRMA' : score >= 35 ? 'NEUTRAL' : 'DÉBIL';

    setConfirm({ score, color, label, reasons, delta, buyVol, sellVol });
  }, [signal, dom, tape]);

  return confirm;
}
