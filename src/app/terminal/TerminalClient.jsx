'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTradovate } from './useTradovate';
import { useZoneConfirm } from './useZoneConfirm';
import { useOrderFlow } from './useOrderFlow';

// ── TradingView Chart Widget ──────────────────────────────────────
function TradingViewChart({ tvSymbol = 'CME_MICRO:MNQ1!' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const id = 'tv_' + Math.random().toString(36).slice(2, 8);
    containerRef.current.innerHTML = '';

    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'height:100%;width:100%;';
    containerRef.current.appendChild(div);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (!window.TradingView) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: '1',
        timezone: 'America/New_York',
        theme: 'dark',
        style: '1',
        locale: 'es',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: id,
      });
    };
    document.head.appendChild(script);

    return () => {
      try { script.remove(); } catch (_) {}
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [tvSymbol]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
// ─────────────────────────────────────────────────────────────────

function useGermanSignals() {
  const [tvSignals, setTvSignals] = useState([]);
  useEffect(() => {
    const es = new EventSource('/api/signal/stream');
    es.onmessage = (e) => {
      try {
        const sig = JSON.parse(e.data);
        setTvSignals(prev => [sig, ...prev].slice(0, 10));
      } catch (_) {}
    };
    return () => es.close();
  }, []);
  return tvSignals;
}

const SYMBOL    = process.env.NEXT_PUBLIC_TRADE_SYMBOL || 'MNQM5';
const TV_SYMBOL = process.env.NEXT_PUBLIC_TV_SYMBOL   || 'CME_MICRO:MNQ1!';
const TICK      = 0.25;
const TICK_VALUE = parseFloat(process.env.NEXT_PUBLIC_TICK_VALUE || '0.5'); // $0.50 MNQ

function randomTick(base) {
  return Math.round((base + (Math.random() - 0.495) * 3) / TICK) * TICK;
}
function simTape(price) {
  return {
    price: Math.round((price + (Math.random() - 0.5) * TICK * 4) / TICK) * TICK,
    size: Math.floor(Math.random() * 300) + 10,
    side: Math.random() > 0.5 ? 'B' : 'S',
    ts: Date.now(),
  };
}
function makeSimBook(price) {
  return {
    asks: Array.from({ length: 5 }, (_, i) => ({ price: price + TICK * (5 - i), size: Math.floor(Math.random() * 800) + 50 })),
    bids: Array.from({ length: 5 }, (_, i) => ({ price: price - TICK * (i + 1), size: Math.floor(Math.random() * 800) + 50 })),
  };
}

export default function TerminalClient() {
  const tv = useTradovate(SYMBOL);
  const isLive = tv.status === 'connected';
  const tvSignals = useGermanSignals();
  const [activeSignal, setActiveSignal] = useState(null);

  const [simPrice, setSimPrice]       = useState(21450.00);
  const [simHod, setSimHod]           = useState(21480.00);
  const [simLod, setSimLod]           = useState(21380.00);
  const [simTapeList, setSimTapeList] = useState([]);
  const [simBook, setSimBook]         = useState(() => makeSimBook(21450.00));
  const simPriceRef = useRef(21450.00);
  const simTapeRef  = useRef([]);

  const [localPos, setLocalPos]     = useState(null);
  const [localPnl, setLocalPnl]     = useState(0);
  const [closedPnl, setClosedPnl]   = useState(0);
  const [qty, setQty]               = useState(1);
  const [signals, setSignals]       = useState([]);
  const [time, setTime]             = useState('');
  const [orderStatus, setOrderStatus] = useState('');

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  // Sim loop
  useEffect(() => {
    if (isLive) return;
    const iv = setInterval(() => {
      const next = randomTick(simPriceRef.current);
      simPriceRef.current = next;
      setSimPrice(next);
      setSimHod(h => Math.max(h, next));
      setSimLod(l => Math.min(l, next));
      setSimBook(makeSimBook(next));
      const entries = Array.from({ length: Math.floor(Math.random() * 4) + 1 }, () => simTape(next));
      simTapeRef.current = [...entries, ...simTapeRef.current].slice(0, 60);
      setSimTapeList([...simTapeRef.current]);
      setLocalPos(pos => {
        if (!pos) return pos;
        const ticks = (next - pos.entry) / TICK;
        const profit = pos.side === 'L' ? ticks * TICK_VALUE * pos.qty : -ticks * TICK_VALUE * pos.qty;
        setLocalPnl(profit);
        return pos;
      });
      const bigBuys  = entries.filter(e => e.side === 'B' && e.size > 200);
      const bigSells = entries.filter(e => e.side === 'S' && e.size > 200);
      if (bigBuys.length)  setSignals(s => [{ type: 'LONG',  msg: `Block buy ${bigBuys[0].size} @ ${bigBuys[0].price.toFixed(2)}`,   ts: Date.now() }, ...s].slice(0, 6));
      if (bigSells.length) setSignals(s => [{ type: 'SHORT', msg: `Block sell ${bigSells[0].size} @ ${bigSells[0].price.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
    }, 250);
    return () => clearInterval(iv);
  }, [isLive]);

  // Live tape signals
  useEffect(() => {
    if (!isLive || !tv.tape.length) return;
    const latest   = tv.tape.slice(0, 3);
    const bigBuys  = latest.filter(e => e.side === 'B' && e.size > 200);
    const bigSells = latest.filter(e => e.side === 'S' && e.size > 200);
    if (bigBuys.length)  setSignals(s => [{ type: 'LONG',  msg: `Block buy ${bigBuys[0].size} @ ${bigBuys[0].price?.toFixed(2)}`,   ts: Date.now() }, ...s].slice(0, 6));
    if (bigSells.length) setSignals(s => [{ type: 'SHORT', msg: `Block sell ${bigSells[0].size} @ ${bigSells[0].price?.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
  }, [isLive, tv.tape]);

  const price    = isLive ? (tv.quote?.bidPrice ?? simPrice) : simPrice;
  const hod      = isLive ? (tv.quote?.high ?? simHod) : simHod;
  const lod      = isLive ? (tv.quote?.low ?? simLod) : simLod;
  const open     = isLive ? (tv.quote?.open ?? 21400) : 21400;
  const vwap     = tv.quote?.vwap ?? 21425.50;
  const tapeData = isLive ? tv.tape : simTapeList;
  const bookData = isLive ? tv.dom  : simBook;
  const topSignal = tvSignals[0] ?? null;
  const confirm   = useZoneConfirm(topSignal, bookData, tapeData);
  const flow      = useOrderFlow(bookData, tapeData, price);

  const change    = price - open;
  const changePct = open ? (change / open) * 100 : 0;
  const isUp      = change >= 0;
  const livePos   = isLive && tv.positions?.find(p => p.contractId?.toString().includes('MNQ'));
  const position  = localPos;

  const goLong = useCallback(async () => {
    if (position) return;
    if (isLive) {
      setOrderStatus('Enviando LONG...');
      const r = await tv.placeOrder('Buy', qty);
      setOrderStatus(r?.orderId ? `Orden #${r.orderId} enviada` : `Error: ${r?.errorText || 'desconocido'}`);
      setTimeout(() => setOrderStatus(''), 3000);
    } else {
      setLocalPos({ side: 'L', qty, entry: simPriceRef.current });
      setLocalPnl(0);
    }
  }, [position, isLive, tv, qty]);

  const goShort = useCallback(async () => {
    if (position) return;
    if (isLive) {
      setOrderStatus('Enviando SHORT...');
      const r = await tv.placeOrder('Sell', qty);
      setOrderStatus(r?.orderId ? `Orden #${r.orderId} enviada` : `Error: ${r?.errorText || 'desconocido'}`);
      setTimeout(() => setOrderStatus(''), 3000);
    } else {
      setLocalPos({ side: 'S', qty, entry: simPriceRef.current });
      setLocalPnl(0);
    }
  }, [position, isLive, tv, qty]);

  const flatten = useCallback(async () => {
    if (!position && !livePos) return;
    if (isLive && livePos) {
      const action = livePos.netPos > 0 ? 'Sell' : 'Buy';
      setOrderStatus('Cerrando posición...');
      const r = await tv.placeOrder(action, Math.abs(livePos.netPos));
      setOrderStatus(r?.orderId ? 'Posición cerrada' : `Error: ${r?.errorText}`);
      setTimeout(() => setOrderStatus(''), 3000);
    } else {
      setClosedPnl(c => c + localPnl);
      setLocalPos(null);
      setLocalPnl(0);
    }
  }, [position, localPnl, isLive, tv, livePos]);

  const executeSignal = useCallback(async (sig) => {
    if (!sig) return;
    const action = sig.dir === 'LONG' ? 'Buy' : 'Sell';
    if (isLive) {
      setOrderStatus(`Ejecutando ${sig.dir} @ ${sig.ep?.toFixed(2)}...`);
      const r = await tv.placeOrder(action, qty);
      setOrderStatus(r?.orderId ? `Orden ${sig.dir} #${r.orderId} enviada` : `Error: ${r?.errorText}`);
    } else {
      setLocalPos({ side: sig.dir === 'LONG' ? 'L' : 'S', qty, entry: sig.ep || simPriceRef.current });
      setLocalPnl(0);
      setOrderStatus(`${sig.dir} simulado @ ${sig.ep?.toFixed(2)}`);
    }
    setActiveSignal(null);
    setTimeout(() => setOrderStatus(''), 4000);
  }, [isLive, tv, qty]);

  useEffect(() => {
    if (activeSignal) executeSignal(activeSignal);
  }, [activeSignal]);

  const statusColor = {
    disconnected: 'text-gray-500', connecting: 'text-yellow-400',
    connected: 'text-green-400',  error: 'text-red-400',
  }[tv.status];
  const statusLabel = {
    disconnected: '○ SIMULACIÓN', connecting: '◌ CONECTANDO...',
    connected: '● TRADOVATE LIVE', error: `✕ ${tv.errorMsg}`,
  }[tv.status];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono text-sm select-none flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold text-base">{SYMBOL} · GERMAN ZONES TERMINAL</span>
          <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{time} ET</span>
          {(tv.status === 'disconnected' || tv.status === 'error') ? (
            <button onClick={tv.connect} className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded text-white">
              Conectar Tradovate
            </button>
          ) : tv.status === 'connected' ? (
            <button onClick={tv.disconnect} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
              Desconectar
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Price Bar ── */}
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <div className={`text-2xl font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {price.toFixed(2)}
            </div>
            <div className={`text-xs mt-0.5 ${isUp ? 'text-green-500' : 'text-red-500'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({changePct.toFixed(2)}%)
            </div>
          </div>
          <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
            <div><span className="text-gray-500">VWAP</span> <span className="text-blue-400">{typeof vwap === 'number' ? vwap.toFixed(2) : vwap}</span></div>
            <div><span className="text-gray-500">HOD</span>  <span className="text-green-400">{typeof hod === 'number' ? hod.toFixed(2) : hod}</span></div>
            <div><span className="text-gray-500">LOD</span>  <span className="text-red-400">{typeof lod === 'number' ? lod.toFixed(2) : lod}</span></div>
            <div><span className="text-gray-500">OPEN</span> <span className="text-gray-300">{typeof open === 'number' ? open.toFixed(2) : open}</span></div>
            <div><span className="text-gray-500">$tick</span> <span className="text-yellow-400">${TICK_VALUE}</span></div>
          </div>
          {/* P&L day */}
          <div className="ml-auto text-xs">
            <span className="text-gray-500">P&amp;L Día: </span>
            <span className={closedPnl >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
              {closedPnl >= 0 ? '+' : ''}{closedPnl.toFixed(2)} USD
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* LEFT: TradingView Chart */}
        <div className="flex-1 border-r border-gray-700 flex flex-col" style={{ minWidth: 0 }}>
          <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider shrink-0 flex items-center gap-2">
            <span className="text-purple-400 font-bold">MNQ</span>
            <span>· 1m · TradingView</span>
            <span className="ml-auto text-gray-600 text-[10px]">CME_MICRO:MNQ1!</span>
          </div>
          <div className="flex-1" style={{ minHeight: 0 }}>
            <TradingViewChart tvSymbol={TV_SYMBOL} />
          </div>
        </div>

        {/* RIGHT: 2×2 panels */}
        <div className="grid grid-cols-2 grid-rows-2 shrink-0" style={{ width: '42%', minWidth: 520 }}>

          {/* R1-C1: Time & Sales */}
          <div className="border-r border-b border-gray-800 flex flex-col overflow-hidden">
            <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider shrink-0">
              Time &amp; Sales
            </div>
            <div className="overflow-hidden flex-1">
              {tapeData.slice(0, 40).map((t, i) => (
                <div
                  key={i}
                  className={`flex justify-between px-3 py-0.5 text-xs border-b border-gray-900
                    ${t.size >= 300 ? (t.side === 'B' ? 'bg-green-900/40' : 'bg-red-900/40') : ''}
                    ${t.side === 'B' ? 'text-green-400' : 'text-red-400'}`}
                >
                  <span>{t.price?.toFixed(2)}</span>
                  <span className={`font-bold ${t.size >= 200 ? 'text-white' : ''}`}>{t.size}</span>
                  <span className="text-gray-600 text-[10px]">{t.side}</span>
                </div>
              ))}
            </div>
          </div>

          {/* R1-C2: Order Book */}
          <div className="border-b border-gray-800 flex flex-col overflow-hidden">
            <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider shrink-0">
              DOM · Order Book
            </div>
            <div className="flex-1 flex flex-col justify-center overflow-hidden">
              {bookData?.asks?.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5">
                  <div className="h-3 bg-red-900/60 rounded-sm shrink-0" style={{ width: `${Math.min((a.size / 800) * 100, 100)}%`, minWidth: 4 }} />
                  <span className="text-red-400 w-16 text-right text-xs shrink-0">{a.price?.toFixed(2)}</span>
                  <span className="text-gray-400 w-10 text-right text-xs shrink-0">{a.size}</span>
                </div>
              ))}
              <div className="flex items-center px-2 py-1 my-1 bg-gray-900 border-y border-gray-700">
                <span className="text-yellow-400 font-bold text-sm w-full text-center">{price.toFixed(2)}</span>
              </div>
              {bookData?.bids?.map((b, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5">
                  <div className="h-3 bg-green-900/60 rounded-sm shrink-0" style={{ width: `${Math.min((b.size / 800) * 100, 100)}%`, minWidth: 4 }} />
                  <span className="text-green-400 w-16 text-right text-xs shrink-0">{b.price?.toFixed(2)}</span>
                  <span className="text-gray-400 w-10 text-right text-xs shrink-0">{b.size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* R2-C1: GERMAN ZONES + Controls */}
          <div className="border-r border-gray-800 flex flex-col overflow-hidden">
            <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 text-xs uppercase tracking-wider shrink-0 flex items-center justify-between">
              <span className="text-yellow-400 font-bold">GERMAN ZONES</span>
              <span className="text-gray-600 text-[10px]">webhook → /api/signal</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Active signal */}
              <div className="p-2">
                {tvSignals.length === 0 ? (
                  <div className="text-gray-600 text-xs text-center py-3 border border-dashed border-gray-800 rounded">
                    Esperando señal de TradingView...
                    <div className="text-[10px] text-gray-700 mt-1">Configura alerta → webhook URL/api/signal</div>
                  </div>
                ) : (() => {
                  const s = tvSignals[0];
                  const isLong = s.dir === 'LONG';
                  const risk = s.ep && s.sl ? Math.abs(s.ep - s.sl) : 0;
                  const age = Math.floor((Date.now() - s.ts) / 60000);
                  return (
                    <div className={`rounded border-2 p-2 ${isLong ? 'border-green-500 bg-green-950/50' : 'border-red-500 bg-red-950/50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-base font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                          {isLong ? '▲ LONG' : '▼ SHORT'}
                          {s.aplus && <span className="ml-2 text-yellow-400 text-sm">⭐ A+</span>}
                          {s.flip  && <span className="ml-2 text-purple-400 text-xs">FLIP</span>}
                        </span>
                        <span className="text-gray-500 text-[10px]">{age === 0 ? 'ahora' : `${age}m`}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-xs">
                        <div><span className="text-gray-500">EP</span> <span className="text-white font-bold">{s.ep?.toFixed(2)}</span></div>
                        <div><span className="text-gray-500">SL</span> <span className="text-red-400">{s.sl?.toFixed(2)}</span></div>
                        <div><span className="text-gray-500">TP1</span> <span className="text-green-400">{s.tp1?.toFixed(2)}</span></div>
                        <div><span className="text-gray-500">TP2</span> <span className="text-green-300">{s.tp2?.toFixed(2)}</span></div>
                        {risk > 0 && <div className="col-span-2 text-gray-500 text-[10px]">Riesgo: {risk.toFixed(2)} pts · ${(risk / TICK * TICK_VALUE).toFixed(0)}/ct</div>}
                      </div>
                      {/* Order flow confirm */}
                      {confirm && (
                        <div className={`mt-2 rounded p-1.5 text-xs border
                          ${confirm.color === 'green'  ? 'bg-green-900/40 border-green-700' :
                            confirm.color === 'yellow' ? 'bg-yellow-900/40 border-yellow-700' :
                            'bg-red-900/40 border-red-700'}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`font-bold text-[11px] ${confirm.color === 'green' ? 'text-green-400' : confirm.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
                              {confirm.color === 'green' ? '✓' : confirm.color === 'yellow' ? '~' : '✗'} FLOW: {confirm.label}
                            </span>
                            <span className="text-gray-400 text-[10px]">{confirm.score}/100</span>
                          </div>
                          {confirm.reasons.map((r, i) => (
                            <div key={i} className="text-gray-400 text-[10px]">· {r}</div>
                          ))}
                          <div className="flex gap-2 mt-0.5 text-[10px] text-gray-500">
                            <span>Δ <span className={confirm.delta >= 0 ? 'text-green-400' : 'text-red-400'}>{confirm.delta >= 0 ? '+' : ''}{confirm.delta}</span></span>
                            <span>B:{confirm.buyVol}</span>
                            <span>S:{confirm.sellVol}</span>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => setActiveSignal(s)}
                        disabled={confirm?.color === 'red'}
                        className={`w-full mt-2 py-1.5 rounded font-bold text-sm transition-colors
                          ${confirm?.color === 'red'
                            ? 'bg-gray-700 cursor-not-allowed text-gray-500'
                            : isLong ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                      >
                        {confirm?.color === 'red' ? 'Order flow débil — espera' : `Ejecutar ${s.dir}`}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Signal history */}
              <div className="px-2 space-y-0.5 pb-1">
                {tvSignals.slice(1).map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${s.dir === 'LONG' ? 'text-green-500' : 'text-red-500'} bg-gray-900`}>
                    <span>{s.dir === 'LONG' ? '▲' : '▼'}</span>
                    <span className="text-gray-400">EP {s.ep?.toFixed(2)}</span>
                    <span className="text-gray-600">SL {s.sl?.toFixed(2)}</span>
                    {s.aplus && <span className="text-yellow-500 text-[10px]">A+</span>}
                    <span className="ml-auto text-gray-700 text-[10px]">{Math.floor((Date.now() - s.ts) / 60000)}m</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="border-t border-gray-800 p-2 space-y-2 shrink-0">
              {orderStatus && (
                <div className="text-xs text-yellow-400 text-center bg-yellow-900/20 rounded py-1">{orderStatus}</div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px] mr-1">CTs:</span>
                {[1, 2, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setQty(n)}
                    className={`px-2 py-0.5 text-xs rounded border ${qty === n ? 'bg-yellow-500 border-yellow-400 text-black font-bold' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={goLong}
                  disabled={!!position}
                  className="py-2 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white font-bold rounded text-xs"
                >
                  ▲ LONG
                </button>
                <button
                  onClick={goShort}
                  disabled={!!position}
                  className="py-2 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white font-bold rounded text-xs"
                >
                  ▼ SHORT
                </button>
                <button
                  onClick={flatten}
                  disabled={!position && !livePos}
                  className="py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-30 text-black font-bold rounded text-xs"
                >
                  CIERRA
                </button>
              </div>
              {/* Live P&L */}
              {(position || livePos) && (
                <div className={`text-center py-1 rounded text-sm font-bold ${localPnl >= 0 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                  {position && `${position.side === 'L' ? 'LONG' : 'SHORT'} ${position.qty}ct @ ${position.entry.toFixed(2)}`}
                  <br />
                  {localPnl >= 0 ? '+' : ''}{localPnl.toFixed(2)} USD
                </div>
              )}
            </div>
          </div>

          {/* R2-C2: FLOW */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 text-xs uppercase tracking-wider shrink-0 flex items-center justify-between">
              <span className="text-blue-400 font-bold">FLOW NATIVO</span>
              <button onClick={flow.resetDelta} className="text-gray-600 hover:text-gray-400 text-[10px]">Reset Δ</button>
            </div>

            {/* Delta meter */}
            <div className="px-3 py-2 border-b border-gray-800 shrink-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Delta acumulado</span>
                <span className={`font-bold ${flow.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {flow.delta >= 0 ? '+' : ''}{flow.delta}
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${flow.delta >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(Math.abs(flow.delta) / 10, 100)}%`, marginLeft: flow.delta < 0 ? 'auto' : 0 }}
                />
              </div>
            </div>

            {/* DOM Imbalance */}
            <div className="px-3 py-2 border-b border-gray-800 shrink-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">DOM Imbalance</span>
                <span className={`font-bold text-xs ${
                  flow.imbalance.signal === 1  ? 'text-green-400' :
                  flow.imbalance.signal === -1 ? 'text-red-400'   : 'text-gray-400'}`}>
                  {flow.imbalance.signal === 1 ? '▲ BIDS' : flow.imbalance.signal === -1 ? '▼ ASKS' : '─ NEUTRO'}
                </span>
              </div>
              <div className="flex gap-1 text-[10px]">
                <div className="flex-1 text-center py-0.5 rounded bg-green-900/40 text-green-400">B {flow.imbalance.bidTotal}</div>
                <div className="flex-1 text-center py-0.5 rounded bg-red-900/40 text-red-400">A {flow.imbalance.askTotal}</div>
                <div className="text-gray-500 flex items-center px-1 text-[10px]">{flow.imbalance.ratio?.toFixed(1)}:1</div>
              </div>
            </div>

            {/* FLOW Signal */}
            <div className="flex-1 p-2 overflow-y-auto">
              {!flow.signal ? (
                <div className="text-gray-700 text-xs text-center pt-4 space-y-1">
                  <div className="text-xl">○</div>
                  <div>Sin señal FLOW</div>
                  <div className="text-[10px] text-gray-800">Esperando confluencia...</div>
                  <div className="mt-3 text-[10px] text-gray-700 text-left space-y-0.5 border border-gray-800 rounded p-2">
                    <div className="text-gray-500 font-bold mb-1">CÓMO USAR:</div>
                    <div>1. GZ señal → mira FLOW CONFIRM</div>
                    <div>2. Verde ≥65 = entra</div>
                    <div>3. Amarillo = espera 1-2 velas más</div>
                    <div>4. Rojo = skip, zona sin respaldo</div>
                    <div className="mt-1 text-gray-600">FLOW solo: si aparece A+ sin señal GZ → entrada directa</div>
                  </div>
                </div>
              ) : (
                <div className={`rounded border-2 p-2 ${flow.signal.dir === 'LONG' ? 'border-blue-500 bg-blue-950/50' : 'border-orange-500 bg-orange-950/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-base font-bold ${flow.signal.dir === 'LONG' ? 'text-blue-400' : 'text-orange-400'}`}>
                      {flow.signal.dir === 'LONG' ? '▲' : '▼'} FLOW {flow.signal.dir}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      flow.signal.grade === 'A+' ? 'bg-yellow-500 text-black' :
                      flow.signal.grade === 'B'  ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                      {flow.signal.grade} {flow.signal.score}/100
                    </span>
                  </div>
                  <div className="space-y-0.5 mb-2">
                    {flow.signal.reasons.map((r, i) => (
                      <div key={i} className="text-[11px] text-gray-300 flex items-start gap-1">
                        <span className={flow.signal.dir === 'LONG' ? 'text-blue-400' : 'text-orange-400'}>✓</span>
                        {r}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => executeSignal({
                      dir: flow.signal.dir,
                      ep: price,
                      sl: flow.signal.dir === 'LONG' ? price - 10 * TICK : price + 10 * TICK,
                    })}
                    className={`w-full py-2 rounded font-bold text-sm
                      ${flow.signal.dir === 'LONG' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'} text-white`}
                  >
                    Ejecutar FLOW {flow.signal.dir}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
