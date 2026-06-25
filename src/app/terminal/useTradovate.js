'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export function useTradovate(symbol = 'NQM5') {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [quote, setQuote] = useState(null);
  const [dom, setDom] = useState(null);   // { bids: [], asks: [] }
  const [tape, setTape] = useState([]);
  const [token, setToken] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [positions, setPositions] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const ws = useRef(null);
  const msgId = useRef(1);
  const heartbeat = useRef(null);
  const tapeRef = useRef([]);

  const send = useCallback((endpoint, body = {}) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const id = msgId.current++;
    const msg = `${endpoint}\n${id}\n\n${JSON.stringify(body)}`;
    ws.current.send(msg);
    return id;
  }, []);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/tradovate/auth', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Auth failed');
        setStatus('error');
        return;
      }

      setToken(data.token);
      const wsUrl = data.wsUrl;

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        // Tradovate sends an initial 'o' frame
      };

      socket.onmessage = (event) => {
        const raw = event.data;

        // Initial connect frame
        if (raw === 'o') {
          socket.send(`authorize\n0\n\n{"token":"${data.token}"}`);
          return;
        }

        // Heartbeat frame
        if (raw === 'h') {
          socket.send('[]');
          return;
        }

        // Closing frame
        if (raw.startsWith('c')) return;

        // Array of messages
        if (raw.startsWith('a')) {
          try {
            const messages = JSON.parse(raw.slice(1));
            messages.forEach(msg => handleMessage(msg, data.token));
          } catch (_) {}
        }
      };

      socket.onerror = () => {
        setStatus('error');
        setErrorMsg('WebSocket error');
      };

      socket.onclose = () => {
        setStatus('disconnected');
        clearInterval(heartbeat.current);
      };

      // Heartbeat every 2.5s
      heartbeat.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('[]');
      }, 2500);

    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }, []);

  const handleMessage = useCallback((msg, tok) => {
    if (!msg || typeof msg !== 'object') return;
    const { i, s, d } = msg;

    // Auth response (id=0)
    if (i === 0 && s === 200) {
      setStatus('connected');
      // Get account info
      ws.current.send(`account/list\n${msgId.current++}\n\n{}`);
    }

    // Account list response
    if (d && Array.isArray(d) && d[0]?.name && d[0]?.id && !accountId) {
      setAccountId(d[0].id);
      // Subscribe to market data
      ws.current.send(`md/subscribeQuote\n${msgId.current++}\n\n{"symbol":"${symbol}"}`);
      ws.current.send(`md/subscribeDOM\n${msgId.current++}\n\n{"symbol":"${symbol}"}`);
      ws.current.send(`md/subscribeHistogram\n${msgId.current++}\n\n{"symbol":"${symbol}"}`);
      // Subscribe to positions
      ws.current.send(`user/syncrequest\n${msgId.current++}\n\n{"accounts":[${d[0].id}]}`);
    }

    // Real-time events
    if (msg.e === 'md') {
      const payload = msg.d;
      if (!payload) return;

      if (payload.quotes) {
        const q = payload.quotes[0];
        if (q) setQuote(prev => ({ ...prev, ...q }));
      }

      if (payload.doms) {
        const domData = payload.doms[0];
        if (domData) {
          const bids = (domData.bids || []).slice(0, 8).map(b => ({ price: b.price, size: b.size }));
          const asks = (domData.asks || []).slice(0, 8).map(a => ({ price: a.price, size: a.size }));
          setDom({ bids, asks: asks.reverse() });
        }
      }

      if (payload.historicalData || payload.ticks) {
        const ticks = payload.ticks || [];
        const newEntries = ticks.map(t => ({
          price: t.price,
          size: t.volumeUp + t.volumeDown,
          side: t.volumeUp > t.volumeDown ? 'B' : 'S',
          ts: Date.now(),
        }));
        tapeRef.current = [...newEntries, ...tapeRef.current].slice(0, 80);
        setTape([...tapeRef.current]);
      }
    }

    if (msg.e === 'pos') {
      setPositions(msg.d?.positions || []);
    }
  }, [symbol, accountId]);

  const placeOrder = useCallback(async (action, qty) => {
    if (!token || !accountId) return;
    const res = await fetch('/api/tradovate/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, accountId, symbol, action, qty }),
    });
    return res.json();
  }, [token, accountId, symbol]);

  const disconnect = useCallback(() => {
    ws.current?.close();
    clearInterval(heartbeat.current);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return { status, quote, dom, tape, positions, errorMsg, connect, disconnect, placeOrder };
}
