const BASE = process.env.TRADOVATE_ENV === 'live'
  ? 'https://live.tradovateapi.com/v1'
  : 'https://demo.tradovateapi.com/v1';

export async function POST(req) {
  const { token, accountId, symbol, action, qty } = await req.json();

  const body = {
    accountId,
    action,         // 'Buy' or 'Sell'
    symbol,
    orderQty: qty,
    orderType: 'Market',
    timeInForce: 'GTC',
    isAutomated: false,
  };

  const res = await fetch(`${BASE}/order/placeorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
