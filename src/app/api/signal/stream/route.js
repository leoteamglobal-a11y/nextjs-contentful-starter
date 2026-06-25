import { clients, signals } from '../store';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send existing signals on connect
      for (const s of signals) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(s)}\n\n`));
      }

      const send = (signal) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(signal)}\n\n`));
        } catch (_) {}
      };

      clients.add(send);

      // Heartbeat every 15s
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch (_) {}
      }, 15000);

      return () => {
        clients.delete(send);
        clearInterval(hb);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
