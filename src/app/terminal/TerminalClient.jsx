'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTradovate } from './useTradovate';
import { useZoneConfirm } from './useZoneConfirm';

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

const SYMBOL = process.env.NEXT_PUBLIC_TRADE_SYMBOL || 'NQM5';
const TICK = 0.25;
const TICK_VALUE = parseFloat(process.env.NEXT_PUBLIC_TICK_VALUE || '5'); // $5 NQ, $0.50 MNQ

// --- Simulation fallback (used when not connected to Tradovate) ---
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
// ----------------------------------------------------------------

export default function TerminalClient() {
  const tv = useTradovate(SYMBOL);
  const isLive = tv.status === 'connected';
  const tvSignals = useGermanSignals();
  const [activeSignal, setActiveSignal] = useState(null);

  // Sim state (used when not connected)
  const [simPrice, setSimPrice] = useState(21450.00);
  const [simHod, setSimHod] = useState(21480.00);
  const [simLod, setSimLod] = useState(21380.00);
  const [simTapeList, setSimTapeList] = useState([]);
  const [simBook, setSimBook] = useState(() => makeSimBook(21450.00));
  const simPriceRef = useRef(21450.00);
  const simTapeRef = useRef([]);

  // Position tracking (local for sim; from Tradovate when live)
  const [localPos, setLocalPos] = useState(null);
  const [localPnl, setLocalPnl] = useState(0);
  const [closedPnl, setClosedPnl] = useState(0);
  const [qty, setQty] = useState(1);
  const [signals, setSignals] = useState([]);
  const [time, setTime] = useState('');
  const [orderStatus, setOrderStatus] = useState('');

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  // Sim loop (only when disconnected)
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

      const bigBuys = entries.filter(e => e.side === 'B' && e.size > 200);
      const bigSells = entries.filter(e => e.side === 'S' && e.size > 200);
      if (bigBuys.length) setSignals(s => [{ type: 'LONG', msg: `Block buy ${bigBuys[0].size} @ ${bigBuys[0].price.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
      if (bigSells.length) setSignals(s => [{ type: 'SHORT', msg: `Block sell ${bigSells[0].size} @ ${bigSells[0].price.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
    }, 250);
    return () => clearInterval(iv);
  }, [isLive]);

  // Signals from live tape
  useEffect(() => {
    if (!isLive || !tv.tape.length) return;
    const latest = tv.tape.slice(0, 3);
    const bigBuys = latest.filter(e => e.side === 'B' && e.size > 200);
    const bigSells = latest.filter(e => e.side === 'S' && e.size > 200);
    if (bigBuys.length) setSignals(s => [{ type: 'LONG', msg: `Block buy ${bigBuys[0].size} @ ${bigBuys[0].price?.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
    if (bigSells.length) setSignals(s => [{ type: 'SHORT', msg: `Block sell ${bigSells[0].size} @ ${bigSells[0].price?.toFixed(2)}`, ts: Date.now() }, ...s].slice(0, 6));
  }, [isLive, tv.tape]);

  // Derived values
  const price = isLive ? (tv.quote?.bidPrice ?? simPrice) : simPrice;
  const hod = isLive ? (tv.quote?.high ?? simHod) : simHod;
  const lod = isLive ? (tv.quote?.low ?? simLod) : simLod;
  const open = isLive ? (tv.quote?.open ?? 21400) : 21400;
  const vwap = tv.quote?.vwap ?? 21425.50;
  const tapeData = isLive ? tv.tape : simTapeList;
  const bookData = isLive ? tv.dom : simBook;
  const topSignal = tvSignals[0] ?? null;
  const confirm = useZoneConfirm(topSignal, bookData, tapeData);

  const change = price - open;
  const changePct = open ? (change / open) * 100 : 0;
  const isUp = change >= 0;

  // Position (use Tradovate positions when live)
  const livePos = isLive && tv.positions?.find(p => p.contractId?.toString().includes('NQ'));
  const position = localPos;

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

  // Auto-execute when button clicked from signal panel
  useEffect(() => {
    if (activeSignal) executeSignal(activeSignal);
  }, [activeSignal]);

  const statusColor = {
    disconnected: 'text-gray-500',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-red-400',
  }[tv.status];

  const statusLabel = {
    disconnected: '○ SIMULACIÓN',
    connecting: '◌ CONECTANDO...',
    connected: '● TRADOVATE LIVE',
    error: `✕ ${tv.errorMsg}`,
  }[tv.status];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono text-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold text-base">{SYMBOL} TERMINAL</span>
          <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{time} ET</span>
          {tv.status === 'disconnected' || tv.status === 'error' ? (
            <button
              onClick={tv.connect}
              className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded text-white"
            >
              Conectar Tradovate
            </button>
          ) : tv.status === 'connected' ? (
            <button
              onClick={tv.disconnect}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              Desconectar
            </button>
          ) : null}
        </div>
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
            <div><span className="text-gray-500">VWAP</span> <span className="text-blue-400">{vwap.toFixed ? vwap.toFixed(2) : vwap}</span></div>
            <div><span className="text-gray-500">HOD</span> <span className="text-green-400">{hod.toFixed ? hod.toFixed(2) : hod}</span></div>
            <div><span className="text-gray-500">LOD</span> <span className="text-red-400">{lod.toFixed ? lod.toFixed(2) : lod}</span></div>
            <div><span className="text-gray-500">OPEN</span> <span className="text-gray-300">{open.toFixed ? open.toFixed(2) : open}</span></div>
          </div>
          {isLive && tv.quote?.askPrice && (
            <div className="ml-auto text-xs">
              <span className="text-green-400">{tv.quote.bidPrice?.toFixed(2)}</span>
              <span className="text-gray-600 mx-1">×</span>
              <span className="text-red-400">{tv.quote.askPrice?.toFixed(2)}</span>
              <span className="text-gray-600 ml-2 text-[10px]">BID × ASK</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-0" style={{ height: 'calc(100vh - 200px)' }}>

        {/* TAPE */}
        <div className="border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider shrink-0">
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

        {/* ORDER BOOK */}
        <div className="border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider shrink-0">
            Order Book (DOM)
          </div>
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            {bookData?.asks?.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                <div className="h-4 bg-red-900/60 rounded-sm shrink-0" style={{ width: `${Math.min((a.size / 800) * 100, 100)}%`, minWidth: 4 }} />
                <span className="text-red-400 w-20 text-right shrink-0">{a.price?.toFixed(2)}</span>
                <span className="text-gray-400 w-12 text-right shrink-0">{a.size}</span>
              </div>
            ))}
            <div className="flex items-center px-3 py-1.5 my-1 bg-gray-900 border-y border-gray-700">
              <span className="text-yellow-400 font-bold text-base w-full text-center">{price.toFixed(2)}</span>
            </div>
            {bookData?.bids?.map((b, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                <div className="h-4 bg-green-900/60 rounded-sm shrink-0" style={{ width: `${Math.min((b.size / 800) * 100, 100)}%`, minWidth: 4 }} />
                <span className="text-green-400 w-20 text-right shrink-0">{b.price?.toFixed(2)}</span>
                <span className="text-gray-400 w-12 text-right shrink-0">{b.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* GERMAN ZONES SIGNALS + CONTROLS */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-xs uppercase tracking-wider shrink-0 flex items-center justify-between">
            <span className="text-yellow-400 font-bold">GERMAN ZONES</span>
            <span className="text-gray-600 text-[10px]">TradingView → webhook</span>
          </div>

          {/* Active signal panel */}
          <div className="shrink-0 p-2">
            {tvSignals.length === 0 ? (
              <div className="text-gray-600 text-xs text-center py-3 border border-dashed border-gray-800 rounded">
                Esperando señal de TradingView...
              </div>
            ) : (
              (() => {
                const s = tvSignals[0];
                const isLong = s.dir === 'LONG';
                const risk = s.ep && s.sl ? Math.abs(s.ep - s.sl) : 0;
                const age = Math.floor((Date.now() - s.ts) / 60000);
                return (
                  <div className={`rounded border-2 p-2 ${isLong ? 'border-green-500 bg-green-950/50' : 'border-red-500 bg-red-950/50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-lg font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                        {isLong ? '▲ LONG' : '▼ SHORT'}
                        {s.aplus && <span className="ml-2 text-yellow-400 text-sm">⭐ A+</span>}
                        {s.flip && <span className="ml-2 text-purple-400 text-sm">FLIP</span>}
                      </span>
                      <span className="text-gray-500 text-[10px]">{age === 0 ? 'ahora' : `${age}m`}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
                      <div><span className="text-gray-500">EP</span> <span className="text-white font-bold">{s.ep?.toFixed(2)}</span></div>
                      <div><span className="text-gray-500">SL</span> <span className="text-red-400">{s.sl?.toFixed(2)}</span></div>
                      <div><span className="text-gray-500">TP1</span> <span className="text-green-400">{s.tp1?.toFixed(2)}</span></div>
                      <div><span className="text-gray-500">TP2</span> <span className="text-green-300">{s.tp2?.toFixed(2)}</span></div>
                      {risk > 0 && <div className="col-span-2 text-gray-500 text-[10px]">Riesgo zona: {risk.toFixed(2)} pts</div>}
                    </div>
                    {/* Zone confirmation */}
                    {confirm && (
                      <div className={`mt-2 rounded p-1.5 text-xs border
                        ${confirm.color === 'green' ? 'bg-green-900/40 border-green-700' :
                          confirm.color === 'yellow' ? 'bg-yellow-900/40 border-yellow-700' :
                          'bg-red-900/40 border-red-700'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold ${confirm.color === 'green' ? 'text-green-400' : confirm.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
                            {confirm.color === 'green' ? '✓' : confirm.color === 'yellow' ? '~' : '✗'} ORDER FLOW: {confirm.label}
                          </span>
                          <span className="text-gray-400">{confirm.score}/100</span>
                        </div>
                        {confirm.reasons.map((r, i) => (
                          <div key={i} className="text-gray-400 text-[10px]">· {r}</div>
                        ))}
                        <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                          <span>Delta: <span className={confirm.delta >= 0 ? 'text-green-400' : 'text-red-400'}>{confirm.delta >= 0 ? '+' : ''}{confirm.delta}</span></span>
                          <span>Compras: {confirm.buyVol}</span>
                          <span>Ventas: {confirm.sellVol}</span>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setActiveSignal(s)}
                      disabled={confirm?.color === 'red'}
                      className={`w-full mt-2 py-1.5 rounded font-bold text-sm transition-colors
                        ${confirm?.color === 'red' ? 'bg-gray-700 cursor-not-allowed text-gray-500' :
                          isLong ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                    >
                      {confirm?.color === 'red' ? 'Order flow débil — espera' : `Ejecutar ${s.dir}`}
                    </button>
                  </div>
                );
              })()
            )}
          </div>

          {/* Signal history */}
          <div className="flex-1 overflow-hidden px-2 space-y-1">
            {tvSignals.slice(1).map((s, i) => (
              <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${s.dir === 'LONG' ? 'text-green-500' : 'text-red-500'} bg-gray-900`}>
                <span className="font-bold">{s.dir === 'LONG' ? '▲' : '▼'}</span>
                <span className="text-gray-400">EP {s.ep?.toFixed(2)}</span>
                <span className="text-gray-600">SL {s.sl?.toFixed(2)}</span>
                {s.aplus && <span className="text-yellow-500 text-[10px]">A+</span>}
                <span className="ml-auto text-gray-700 text-[10px]">{Math.floor((Date.now() - s.ts) / 60000)}m</span>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="border-t border-gray-800 p-3 space-y-3 shrink-0">
            {orderStatus && (
              <div className="text-xs text-yellow-400 text-center bg-yellow-900/20 rounded py-1">{orderStatus}</div>
            )}
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
              disabled={!position && !livePos}
              className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded text-sm transition-colors"
            >
              CERRAR POSICIÓN
            </button>
          </div>
        </div>
      </div>

      {/* Position Bar */}
      <div className={`fixed bottom-0 left-0 right-0 px-4 py-2 border-t border-gray-700 flex items-center gap-6
        ${(position || livePos) ? (localPnl >= 0 ? 'bg-green-950' : 'bg-red-950') : 'bg-gray-900'}`}>
        {position ? (
          <>
            <span className="text-gray-400 text-xs">POSICIÓN:</span>
            <span className={`font-bold ${position.side === 'L' ? 'text-green-400' : 'text-red-400'}`}>
              {position.side === 'L' ? 'LONG' : 'SHORT'} {position.qty} contrato{position.qty > 1 ? 's' : ''}
            </span>
            <span className="text-gray-500 text-xs">@ {position.entry.toFixed(2)}</span>
            <span className={`font-bold text-lg ml-auto ${localPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {localPnl >= 0 ? '+' : ''}{localPnl.toFixed(2)} USD
            </span>
          </>
        ) : livePos ? (
          <>
            <span className="text-gray-400 text-xs">POSICIÓN LIVE:</span>
            <span className={`font-bold ${livePos.netPos > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {livePos.netPos > 0 ? 'LONG' : 'SHORT'} {Math.abs(livePos.netPos)} contrato{Math.abs(livePos.netPos) > 1 ? 's' : ''}
            </span>
            <span className="text-gray-500 text-xs">@ {livePos.netPrice?.toFixed(2)}</span>
            <span className={`font-bold text-lg ml-auto ${(livePos.openPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(livePos.openPnl || 0) >= 0 ? '+' : ''}{(livePos.openPnl || 0).toFixed(2)} USD
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
