// In-memory signal store shared across requests
export const signals = [];
export const clients = new Set();

export function pushSignal(signal) {
  signals.unshift(signal);
  if (signals.length > 20) signals.pop();
  for (const send of clients) {
    send(signal);
  }
}
