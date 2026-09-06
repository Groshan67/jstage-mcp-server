#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
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

  // این سرور واقعاً stateless‌ه: هر درخواست POST یه server/transport جدید می‌سازه
  // و هیچ session ای بین درخواست‌ها حفظ نمی‌شه. برای این‌که transport هم دقیقاً
  // همین رفتار رو ازش انتظار داشته باشه (و session ID رو بین initialize و
  // درخواست‌های بعدی چک نکنه)، sessionIdGenerator رو صراحتاً undefined می‌ذاریم.
  // اگه یه sessionIdGenerator واقعی (مثلاً randomUUID) بدیم ولی خودمون session رو
  // جایی ذخیره نکنیم، درخواست دوم (tools/list) با خطای «session not found» رد
  // می‌شه و کلاینت (مثلاً Claude) فقط می‌گه «no tools available» بدون جزئیات.
  app.post("/mcp", async (req, res) => {
    const server = createJStageMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // طبق مستندات رسمی SDK، برای حالت stateless بهتره GET/DELETE رو صراحتاً
  // 405 برگردونیم (نه بذاریم Express خودش 404 پیش‌فرض بده) چون این متدها
  // فقط برای مدیریت session معنا دارن که ما اصلاً نداریم.
  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)." },
      id: null,
    });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)." },
      id: null,
    });
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