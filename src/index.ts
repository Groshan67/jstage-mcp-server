#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createJStageMcpServer } from "./server.js";

const TRANSPORT_TYPE = process.env.MCP_TRANSPORT_TYPE ?? "stdio";
// اکثر پلتفرم‌های هاستینگ (Railway, Render, Fly.io) خودشون یه PORT رو تزریق می‌کنن
// و انتظار دارن اپ روی همون گوش بده — برای همین اول PORT رو چک می‌کنیم.
const HTTP_PORT = Number(process.env.PORT ?? process.env.MCP_HTTP_PORT ?? 3011);

async function runStdio() {
  const server = createJStageMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jstage-mcp-server در حالت stdio روشن شد.");
}

async function runHttp() {
  const app = express();
  app.use(express.json());

  // خیلی از پلتفرم‌های هاستینگ برای health check یه GET ساده به / می‌زنن
  app.get("/", (_req, res) => {
    res.status(200).send("jstage-mcp-server is running. MCP endpoint: POST /mcp");
  });

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