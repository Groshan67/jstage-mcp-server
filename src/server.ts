import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchArticlesSchema,
  searchArticlesHandler,
} from "./tools/searchArticles.js";
import {
  searchJournalsSchema,
  searchJournalsHandler,
} from "./tools/searchJournals.js";
import { listVolumesSchema, listVolumesHandler } from "./tools/listVolumes.js";
import {
  fetchArticleTextSchema,
  fetchArticleTextHandler,
} from "./tools/fetchArticleText.js";
import { registerJStageInfoResource } from "./resources/databaseInfo.js";
import { registerResearchPlanPrompt } from "./prompts/researchPlan.js";
import { registerSummarizeAndQaPrompt } from "./prompts/summarizeAndQa.js";

/**
 * می‌سازه و همه‌ی ابزارها، منابع و پرامپت‌های J-STAGE رو روش ثبت می‌کنه.
 * این تابع مستقل از transport‌ه — چه stdio چه HTTP همینو صدا می‌زنن.
 */
export function createJStageMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "jstage-mcp-server",
      version: "0.2.0",
    },
    {
      // فعال کردن صریح capability لاگ — برخلاف tools/resources/prompts که
      // خودکار از روی register شدن‌شون تشخیص داده می‌شن، logging باید اینجا
      // صراحتاً اعلام بشه وگرنه توی Inspector قرمز می‌مونه.
      capabilities: {
        logging: {},
      },
    }
  );

  // ---------- Tools ----------
  server.registerTool(
    "jstage_search_articles",
    {
      title: "Search J-STAGE articles",
      description:
        "جستجوی مقالات علمی و فنی ژاپنی در J-STAGE بر اساس کلیدواژه، نویسنده، نشریه یا بازه‌ی سال. " +
        "توجه: فقط متادیتا (عنوان، نویسنده، چکیده، DOI، لینک) برمی‌گردونه، نه متن کامل مقاله.",
      inputSchema: searchArticlesSchema,
    },
    async (args, extra) => {
      await extra.sendNotification({
        method: "notifications/message",
        params: {
          level: "info",
          logger: "jstage-mcp-server",
          data: `جستجوی مقاله با کلیدواژه: ${args.keyword ?? "(بدون کلیدواژه)"}`,
        },
      });
      return searchArticlesHandler(args);
    }
  );

  server.registerTool(
    "jstage_search_journals",
    {
      title: "Search J-STAGE journals",
      description:
        "جستجوی نشریات (ژورنال‌ها) نمایه‌شده در J-STAGE بر اساس نام یا ISSN. " +
        "برای پیدا کردن ISSN/کد یه نشریه قبل از جستجوی مقاله یا گرفتن فهرست شماره‌ها مفیده.",
      inputSchema: searchJournalsSchema,
    },
    searchJournalsHandler
  );

  server.registerTool(
    "jstage_list_volumes",
    {
      title: "List J-STAGE journal volumes/issues",
      description:
        "گرفتن فهرست شماره‌ها (جلد/شماره) یه نشریه‌ی خاص در J-STAGE. " +
        "برای این ابزار حتماً باید نام نشریه، ISSN یا کد نشریه رو بدی.",
      inputSchema: listVolumesSchema,
    },
    listVolumesHandler
  );

  server.registerTool(
    "jstage_fetch_article_abstract_and_references",
    {
      title: "Fetch abstract & references for a J-STAGE article",
      description:
        "برای یه مقاله‌ی مشخص (با لینکی که از jstage_search_articles گرفتی)، سعی می‌کنه " +
        "چکیده (Abstract) رو از صفحه‌ی معمولی مقاله دربیاره (universal، برای اکثر مقالات کار می‌کنه) " +
        "و در صورت امکان بخشی از فهرست منابع (References) رو هم از نسخه‌ی txt (فقط بعضی نشریات) اضافه کنه. " +
        "💡 نکته: اگه هدف نهایی خلاصه‌سازی یا پرسش‌وپاسخ فارسی روی این مقاله‌ست، به‌جای صدا زدن مستقیم " +
        "این ابزار، بهتره از prompt جدا jstage_summarize_and_qa استفاده کنی که دستورالعمل خلاصه‌سازی " +
        "غیرتحت‌اللفظی رو هم شامل می‌شه.",
      inputSchema: fetchArticleTextSchema,
    },
    fetchArticleTextHandler
  );

  // ---------- Resources ----------
  registerJStageInfoResource(server);

  // ---------- Prompts (شامل Completions) ----------
  registerResearchPlanPrompt(server);
  registerSummarizeAndQaPrompt(server);

  return server;
}
