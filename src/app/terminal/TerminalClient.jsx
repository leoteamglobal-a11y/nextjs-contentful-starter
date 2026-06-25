'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const SYMBOL = 'NQ';
const TICK = 0.25;
const TICK_VALUE = 5; // $5 per tick per contract

function randomTick(base) {
  const move = (Math.random() - 0.495) * 3;
  return Math.round((base + move) / TICK) * TICK;
}

function generateTape(price) {
  const size = Math.floor(Math.random() * 300) + 10;
  const side = Math.random() > 0.5 ? 'B' : 'S';
  const px = price + (Math.random() - 0.5) * TICK * 4;
  return { price: Math.round(px / TICK) * TICK, size, side, ts: Date.now() };
}

function buildBook(price) {
  const asks = Array.from({ length: 5 }, (_, i) => ({
    price: price + TICK * (i + 1),
    size: Math.floor(Math.random() * 800) + 50,
  }));
  const bids = Array.from({ length: 5 }, (_, i) => ({
    price: price - TICK * (i + 1),
    size: Math.floor(Math.random() * 800) + 50,
  }));
  return { asks: asks.reverse(), bids };
}

export default function TerminalClient() {
  const [price, setPrice] = useState(21450.00);
  const [open] = useState(21400.00);
  const [hod, setHod] = useState(21480.00);
  const [lod, setLod] = useState(21380.00);
  const [vwap] = useState(21425.50);
  const [tape, setTape] = useState([]);
  const [book, setBook] = useState(buildBook(21450.00));
  const [position, setPosition] = useState(null); // {side, qty, entry}
  const [pnl, setPnl] = useState(0);
  const [closedPnl, setClosedPnl] = useState(0);
  const [qty, setQty] = useState(1);
  const [signals, setSignals] = useState([]);
  const [time, setTime] = useState('');
  const priceRef = useRef(21450.00);
  const tapeBuffer = useRef([]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Price feed simulation
  useEffect(() => {
    const interval = setInterval(() => {
      const next = randomTick(priceRef.current);
      priceRef.current = next;
      setPrice(next);
      setHod(h => Math.max(h, next));
      setLod(l => Math.min(l, next));
      setBook(buildBook(next));

      // Generate tape entries
      const entries = Array.from({ length: Math.floor(Math.random() * 4) + 1 }, () => generateTape(next));
      tapeBuffer.current = [...entries, ...tapeBuffer.current].slice(0, 60);
      setTape([...tapeBuffer.current]);

      // Update open position P&L
      setPosition(pos => {
        if (!pos) return pos;
        const ticks = (next - pos.entry) / TICK;
        const profit = pos.side === 'L' ? ticks * TICK_VALUE * pos.qty : -ticks * TICK_VALUE * pos.qty;
        setPnl(profit);
        return pos;
      });

      // Signal detection (simple logic)
      const bigBuys = entries.filter(e => e.side === 'B' && e.size > 200);
      const bigSells = entries.filter(e => e.side === 'S' && e.size > 200);
      if (bigBuys.length > 0) {
        setSignals(s => [{ type: 'LONG', msg: `Block buy ${bigBuys[0].size} @ ${bigBuys[0].price.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 5));
      }
      if (bigSells.length > 0) {
        setSignals(s => [{ type: 'SHORT', msg: `Block sell ${bigSells[0].size} @ ${bigSells[0].price.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 5));
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const goLong = useCallback(() => {
    if (position) return;
    setPosition({ side: 'L', qty, entry: priceRef.current });
    setPnl(0);
  }, [position, qty]);

  const goShort = useCallback(() => {
    if (position) return;
    setPosition({ side: 'S', qty, entry: priceRef.current });
    setPnl(0);
  }, [position, qty]);

  const flatten = useCallback(() => {
    if (!position) return;
    setClosedPnl(c => c + pnl);
    setPosition(null);
    setPnl(0);
  }, [position, pnl]);

  const change = price - open;
  const changePct = (change / open) * 100;
  const isUp = change >= 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono text-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold text-base">{SYMBOL} TERMINAL</span>
          <span className="text-green-400 text-xs animate-pulse">● LIVE</span>
        </div>
        <div className="text-gray-400 text-xs">{time} ET</div>
      </div>

      {/* Price Bar */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <div className={`text-3xl font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {price.toFixed(2)}
            </div>
            <div className={`text-xs mt-0.5 ${isUp ? 'text-green-500' : 'text-red-500'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({changePct.toFixed(2)}%)
            </div>
          </div>
          <div className="flex gap-5 text-xs text-gray-400">
            <div><span className="text-gray-500">VWAP</span> <span className="text-blue-400">{vwap.toFixed(2)}</span></div>
            <div><span className="text-gray-500">HOD</span> <span className="text-green-400">{hod.toFixed(2)}</span></div>
            <div><span className="text-gray-500">LOD</span> <span className="text-red-400">{lod.toFixed(2)}</span></div>
            <div><span className="text-gray-500">OPEN</span> <span className="text-gray-300">{open.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-0 h-[calc(100vh-180px)]">

        {/* TAPE */}
        <div className="border-r border-gray-800 flex flex-col">
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            Time &amp; Sales
          </div>
          <div className="flex-1 overflow-hidden">
            {tape.slice(0, 35).map((t, i) => (
              <div
                key={i}
                className={`flex justify-between px-3 py-0.5 text-xs border-b border-gray-900
                  ${t.size >= 300 ? (t.side === 'B' ? 'bg-green-900/40' : 'bg-red-900/40') : ''}
                  ${t.side === 'B' ? 'text-green-400' : 'text-red-400'}`}
              >
                <span>{t.price.toFixed(2)}</span>
                <span className={`font-bold ${t.size >= 200 ? 'text-white' : ''}`}>{t.size}</span>
                <span className="text-gray-600 text-[10px]">{t.side}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ORDER BOOK */}
        <div className="border-r border-gray-800 flex flex-col">
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            Order Book
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {/* Asks */}
            {book.asks.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                <div
                  className="h-4 bg-red-900/60 rounded-sm"
                  style={{ width: `${Math.min((a.size / 800) * 100, 100)}%`, minWidth: 4 }}
                />
                <span className="text-red-400 w-20 text-right">{a.price.toFixed(2)}</span>
                <span className="text-gray-400 w-16 text-right">{a.size}</span>
              </div>
            ))}

            {/* Spread */}
            <div className="flex items-center gap-2 px-3 py-1 my-1 bg-gray-900 border-y border-gray-700">
              <span className="text-yellow-400 font-bold text-base w-full text-center">{price.toFixed(2)}</span>
            </div>

            {/* Bids */}
            {book.bids.map((b, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                <div
                  className="h-4 bg-green-900/60 rounded-sm"
                  style={{ width: `${Math.min((b.size / 800) * 100, 100)}%`, minWidth: 4 }}
                />
                <span className="text-green-400 w-20 text-right">{b.price.toFixed(2)}</span>
                <span className="text-gray-400 w-16 text-right">{b.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SIGNALS + CONTROLS */}
        <div className="flex flex-col">
          {/* Signals */}
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            Señales de Entrada
          </div>
          <div className="flex-1 overflow-hidden p-2 space-y-1">
            {signals.length === 0 && (
              <div className="text-gray-600 text-xs text-center pt-4">Esperando señales...</div>
            )}
            {signals.map((s, i) => (
              <div
                key={i}
                className={`px-2 py-1.5 rounded text-xs border
                  ${s.type === 'LONG' ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}
              >
                <span className={`font-bold mr-2 ${s.type === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                  {s.type === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                </span>
                {s.msg}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="border-t border-gray-800 p-3 space-y-3">
            {/* Qty selector */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">CONTRATOS:</span>
              {[1, 2, 5, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={`px-2 py-1 text-xs rounded border ${qty === n ? 'bg-yellow-500 border-yellow-400 text-black font-bold' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Entry buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={goLong}
                disabled={!!position}
                className="py-3 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded text-sm transition-colors"
              >
                ▲ LONG
              </button>
              <button
                onClick={goShort}
                disabled={!!position}
                className="py-3 bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded text-sm transition-colors"
              >
                ▼ SHORT
              </button>
            </div>

            <button
              onClick={flatten}
              disabled={!position}
              className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded text-sm transition-colors"
            >
              CERRAR POSICIÓN
            </button>
          </div>
        </div>
      </div>

      {/* Position Bar */}
      <div className={`fixed bottom-0 left-0 right-0 px-4 py-2 border-t border-gray-700 flex items-center gap-6
        ${position ? (pnl >= 0 ? 'bg-green-950' : 'bg-red-950') : 'bg-gray-900'}`}>
        {position ? (
          <>
            <span className="text-gray-400 text-xs">POSICIÓN:</span>
            <span className={`font-bold ${position.side === 'L' ? 'text-green-400' : 'text-red-400'}`}>
              {position.side === 'L' ? 'LONG' : 'SHORT'} {position.qty} contrato{position.qty > 1 ? 's' : ''}
            </span>
            <span className="text-gray-500 text-xs">@ {position.entry.toFixed(2)}</span>
            <span className={`font-bold text-lg ml-auto ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USD
            </span>
          </>
        ) : (
          <>
            <span className="text-gray-500 text-xs">SIN POSICIÓN</span>
            <span className="ml-auto text-gray-400 text-xs">
              P&amp;L Día: <span className={closedPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                {closedPnl >= 0 ? '+' : ''}{closedPnl.toFixed(2)} USD
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
