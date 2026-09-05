import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { queryJStage } from "../services/jstage/client.js";

/**
 * پرامپت آماده‌ای که یه روند تحقیق ساختاریافته روی J-STAGE پیشنهاد می‌ده.
 * برخلاف Tool که مدل خودش تصمیم می‌گیره کِی صداش بزنه، این کاربر (یا کلاینت)
 * صریحاً از منوی Prompt انتخابش می‌کنه.
 *
 * فیلد topic با completable() پیچیده شده تا قابلیت Completions هم روشن بشه:
 * وقتی کاربر داره تایپ می‌کنه، سرور می‌تونه پیشنهادهای زنده بده.
 */
export function registerResearchPlanPrompt(server: McpServer): void {
  server.registerPrompt(
    "jstage_research_plan",
    {
      title: "J-STAGE Research Plan",
      description:
        "یه برنامه‌ی جستجوی چندمرحله‌ای روی J-STAGE برای یه موضوع مشخص می‌سازه",
      argsSchema: {
        topic: completable(z.string(), async (value) => {
          // پیشنهاد تکمیل خودکار: چندتا موضوع رایج نمونه برای شروع تایپ کاربر
          const suggestions = [
            "人工知能", // هوش مصنوعی
            "再生可能エネルギー", // انرژی تجدیدپذیر
            "遺伝子治療", // ژن‌درمانی
            "気候変動", // تغییر اقلیم
            "ロボット工学", // رباتیک
          ];
          return suggestions.filter((s) => s.startsWith(value));
        }),
        pub_year_from: z.string().optional(),
      },
    },
    async ({ topic, pub_year_from }) => {
      // یه پیش‌نمایش سریع می‌گیریم تا پرامپت با یه نمونه‌ی واقعی همراه باشه
      let previewNote = "";
      try {
        const preview = await queryJStage({
          service: 3,
          keyword: topic,
          count: 3,
          pubyearfrom: pub_year_from ? Number(pub_year_from) : undefined,
        });
        previewNote = `(در حال حاضر حدود ${preview.totalResults ?? "نامشخص"} نتیجه برای این موضوع در J-STAGE ثبت شده)`;
      } catch {
        previewNote = "(پیش‌نمایش اولیه در دسترس نبود، ولی برنامه‌ی زیر رو دنبال کن)";
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `می‌خوام یه تحقیق ساختاریافته درباره‌ی «${topic}» روی J-STAGE انجام بدم. ${previewNote}`,
                "",
                "لطفاً این مراحل رو دنبال کن:",
                "۱. با jstage_search_articles روی این موضوع جستجوی اولیه بزن (کلیدواژه‌ی ژاپنی و در صورت لزوم انگلیسی رو هر دو امتحان کن)",
                "۲. نتایج رو بر اساس سال انتشار مرتب کن و ۵ مقاله‌ی مرتبط‌تر رو مشخص کن",
                "۳. اگه یه نشریه‌ی خاص توی نتایج پررنگ بود، با jstage_search_journals جزئیات بیشتری ازش بگیر",
                "۴. یه خلاصه از وضعیت فعلی پژوهش روی این موضوع (بر اساس چکیده‌ها) بنویس",
                "۵. برای هر مقاله، لینک یا DOI رو هم بده تا در صورت نیاز به متن کامل مراجعه بشه",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
