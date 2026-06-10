import { subscribeRoom, type RoomEvent } from "@/lib/realtime/bus";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Server-Sent Events stream for a trip room. Every open tab holds one of these
// and receives message/reaction events live. EventSource reconnects on its own
// if the connection drops; the client refetches /state on (re)connect to catch
// up, so a brief gap loses nothing.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const group = await getStore().getGroupByWaId(slug);
  if (!group) {
    return new Response("Trip room not found.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream already closed; nothing to do.
        }
      };
      write(": connected\n\n");
      const unsubscribe = subscribeRoom(group.id, (event: RoomEvent) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
