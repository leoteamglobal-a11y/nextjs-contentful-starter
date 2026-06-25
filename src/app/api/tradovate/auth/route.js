const BASE = process.env.TRADOVATE_ENV === 'live'
  ? 'https://live.tradovateapi.com/v1'
  : 'https://demo.tradovateapi.com/v1';

export async function POST() {
  try {
    const res = await fetch(`${BASE}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: process.env.TRADOVATE_USERNAME,
        password: process.env.TRADOVATE_PASSWORD,
        appId: process.env.TRADOVATE_APP_ID || 'BB Terminal',
        appVersion: '1.0.0',
        cid: parseInt(process.env.TRADOVATE_CID || '0'),
        sec: process.env.TRADOVATE_SEC || '',
        deviceId: 'bb-terminal-001',
      }),
    });

    const data = await res.json();

    if (!res.ok || data['p-ticket']) {
      return Response.json({ error: data.errorText || 'Auth failed' }, { status: 401 });
    }

    return Response.json({
      token: data.accessToken,
      userId: data.userId,
      env: process.env.TRADOVATE_ENV || 'demo',
      wsUrl: process.env.TRADOVATE_ENV === 'live'
        ? 'wss://live.tradovateapi.com/v1/websocket'
        : 'wss://demo.tradovateapi.com/v1/websocket',
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
