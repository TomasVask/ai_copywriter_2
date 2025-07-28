import { runWorkflow } from "@/services/graph/graph";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false, // SSE requires manual body parsing
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end("Method Not Allowed");
    return;
  }

  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    const { messages, models } = JSON.parse(body);

    // Important SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no" // Prevents Nginx buffering
    });

    // Custom flush function to force immediate sending
    const flush = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (res as any).flush === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (res as any).flush();
      }
    };

    try {
      await runWorkflow(messages, models, (stepData) => {
        const stringifiedContent = JSON.stringify(stepData);
        res.write(`data: ${stringifiedContent}\n\n`);
        flush(); // Force sending this chunk immediately
      });

      // Send end event and close
      res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
      res.end();
    } catch (error) {
      const json = JSON.stringify({ error: String(error), type: "error" });
      res.write(`❌ Error: ${json}\n\n`);
      res.end();
    }
  });
}