#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createJStageMcpServer } from "./server.js";

const TRANSPORT_TYPE = process.env.MCP_TRANSPORT_TYPE ?? "stdio";
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT ?? 3011);

async function runStdio() {
  const server = createJStageMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jstage-mcp-server در حالت stdio روشن شد.");
}

async function runHttp() {
  const app = express();
  app.use(express.json());

  // برای سادگی، هر درخواست POST به /mcp یه سشن جدید و مستقل می‌سازه (stateless).
  // اگه نیاز به نگه‌داشتن session بین چند درخواست داری (مثلاً برای SSE)،
  // باید یه session store (مثل Redis) اضافه کنی — دقیقاً همون الگویی که
  // adapter رسمی Vercel (mcp-handler) هم برای Next.js استفاده می‌کنه.
  app.post("/mcp", async (req, res) => {
    const server = createJStageMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(HTTP_PORT, () => {
    console.error(
      `jstage-mcp-server در حالت HTTP روی پورت ${HTTP_PORT} گوش می‌ده (مسیر /mcp).`
    );
  });
}

if (TRANSPORT_TYPE === "http") {
  runHttp().catch((err) => {
    console.error("راه‌اندازی سرور HTTP شکست خورد:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("راه‌اندازی سرور stdio شکست خورد:", err);
    process.exit(1);
  });
}
