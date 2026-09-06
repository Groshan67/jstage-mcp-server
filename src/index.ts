#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
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

  /**
   * چرا اینجا از حالت stateful واقعی استفاده می‌کنیم (نه transport جدید در هر
   * request):
   *
   * قابلیت‌هایی مثل Completions شامل چندین درخواست *مستقل* در طول زمانن
   * (هر حرفی که تایپ می‌شه، یه completion/complete جدا می‌فرسته) که هیچ‌کدوم
   * دوباره initialize رو بسته‌بندی نمی‌کنن — چون فرض می‌کنن سرور از قبل session
   * رو یادشه. اگه هر request یه transport تازه و بی‌خبر بسازه، این درخواست‌های
   * مستقل به یه transport مقداردهی‌نشده می‌خورن و رد می‌شن.
   *
   * چون این سرور (برخلاف یه تابع serverless مثل Vercel Function) یه پروسه‌ی
   * Node همیشه‌روشن روی Railway‌ست، نگه‌داشتن session‌ها توی یه Map ساده‌ی
   * داخل حافظه کاملاً امن و کافیه — نیازی به Redis نیست.
   */
  const sessions: Record<
    string,
    { server: ReturnType<typeof createJStageMcpServer>; transport: StreamableHTTPServerTransport }
  > = {};

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions[sessionId]) {
      // درخواست بعدی از یه session از قبل شناخته‌شده — از همون transport استفاده کن
      await sessions[sessionId].transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      // اولین درخواست یه session جدید — server و transport جدید بساز
      const server = createJStageMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions[newSessionId] = { server, transport };
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete sessions[transport.sessionId];
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // نه session شناخته‌شده، نه یه initialize جدید — درخواست نامعتبره
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided.",
      },
      id: null,
    });
  });

  // GET برای استریم SSE (پیام‌های سرور به کلاینت) و DELETE برای پایان دادن به session
  // هر دو نیاز به همون session از قبل مقداردهی‌شده دارن.
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await sessions[sessionId].transport.handleRequest(req, res);
  };

  app.get("/mcp", handleSessionRequest);
  app.delete("/mcp", handleSessionRequest);

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