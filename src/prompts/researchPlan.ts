import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { queryJStage } from "../services/jstage/client.js";

/**
 * فهرست موضوعات نمونه برای پیشنهاد خودکار (Completions) روی فیلد topic.
 * از حوزه‌های مختلف انتخاب شدن (نه فقط هوش مصنوعی) تا کاربر یه حس واقعی از
 * تنوع محتوای J-STAGE بگیره. هر مدخل: [کلیدواژه‌ی ژاپنی, معادل فارسی برای راهنما]
 */
const TOPIC_SUGGESTIONS: { term: string; glossFa: string }[] = [
  { term: "人工知能", glossFa: "هوش مصنوعی" },
  { term: "機械学習", glossFa: "یادگیری ماشین" },
  { term: "再生可能エネルギー", glossFa: "انرژی تجدیدپذیر" },
  { term: "遺伝子治療", glossFa: "ژن‌درمانی" },
  { term: "気候変動", glossFa: "تغییر اقلیم" },
  { term: "ロボット工学", glossFa: "رباتیک" },
  { term: "地震工学", glossFa: "مهندسی زلزله" },
  { term: "防災", glossFa: "پیشگیری از بلایا" },
  { term: "量子コンピュータ", glossFa: "رایانش کوانتومی" },
  { term: "半導体", glossFa: "نیمه‌هادی‌ها" },
  { term: "がん治療", glossFa: "درمان سرطان" },
  { term: "海洋生物学", glossFa: "زیست‌شناسی دریایی" },
  { term: "農業技術", glossFa: "فناوری کشاورزی" },
  { term: "新素材", glossFa: "مواد نوین" },
  { term: "感染症", glossFa: "بیماری‌های عفونی" },
];

function matchSuggestions(value: string): string[] {
  const query = value.trim().toLowerCase();
  if (!query) return TOPIC_SUGGESTIONS.map((t) => t.term);

  return TOPIC_SUGGESTIONS.filter(
    (t) =>
      t.term.includes(query) ||
      t.glossFa.toLowerCase().includes(query) ||
      t.term.toLowerCase().startsWith(query)
  ).map((t) => t.term);
}

function formatNumber(n?: number): string {
  if (n === undefined) return "نامشخص";
  return n.toLocaleString("en-US");
}

export function registerResearchPlanPrompt(server: McpServer): void {
  server.registerPrompt(
    "jstage_research_plan",
    {
      title: "برنامه‌ی تحقیق روی J-STAGE",
      description:
        "یه برنامه‌ی جستجوی چندمرحله‌ای و آماده روی J-STAGE برای یه موضوع مشخص می‌سازه — " +
        "شامل پیش‌نمایش تعداد نتایج، راهبرد جستجوی دوزبانه، و مراحل مشخص برای Claude تا دنبال کنه.",
      argsSchema: {
        topic: completable(
          z
            .string()
            .describe(
              "موضوع تحقیق (ترجیحاً ژاپنی یا انگلیسی؛ چندتا نمونه‌ی رایج برای autocomplete در دسترسه)"
            ),
          async (value) => matchSuggestions(value)
        ),
        depth: z
          .enum(["quick", "thorough"])
          .default("thorough")
          .describe(
            "quick = فقط یه جستجوی سریع و خلاصه؛ thorough = بررسی کامل شامل نشریات مرتبط و چند دور جستجو"
          ),
        pub_year_from: z
          .string()
          .optional()
          .describe("محدود کردن به مقالات بعد از این سال (مثلاً 2018)"),
      },
    },
    async ({ topic, depth, pub_year_from }) => {
      const yearFrom = pub_year_from ? Number(pub_year_from) : undefined;

      let totalResults: number | undefined;
      let topJournal: string | undefined;
      try {
        const preview = await queryJStage({
          service: 3,
          keyword: topic,
          count: 5,
          pubyearfrom: yearFrom,
        });
        totalResults = preview.totalResults;
        const firstEntry = preview.entries[0] as
          | { material_title?: { en?: string; ja?: string } }
          | undefined;
        topJournal =
          firstEntry?.material_title?.en || firstEntry?.material_title?.ja;
      } catch {
        // پیش‌نمایش اختیاریه — اگه شکست خورد، برنامه بدون عدد دقیق ادامه پیدا می‌کنه
      }

      const previewLine =
        totalResults !== undefined
          ? `📊 در حال حاضر حدود **${formatNumber(totalResults)}** نتیجه برای «${topic}» در J-STAGE ثبت شده${
              topJournal ? ` (یکی از نشریات پرتکرار: ${topJournal})` : ""
            }.`
          : "📊 پیش‌نمایش اولیه در دسترس نبود — ولی برنامه‌ی زیر رو مستقل از اون دنبال کن.";

      const yearNote = yearFrom
        ? `\n🗓️ فقط مقالات از سال ${yearFrom} به بعد رو در نظر بگیر.`
        : "";

      const quickSteps = [
        "۱. با jstage_search_articles یه جستجوی سریع بزن (حداکثر ۱۰ نتیجه کافیه).",
        "۲. سه مقاله‌ی مرتبط‌تر رو بر اساس عنوان و سال انتخاب کن.",
        "۳. یه خلاصه‌ی دو-سه خطی از یافته‌ها بده، همراه با لینک/DOI هر مقاله.",
      ];

      const thoroughSteps = [
        "۱. با jstage_search_articles روی این موضوع جستجو کن — هم با کلیدواژه‌ی اصلی، هم (اگه موضوع بین‌المللی‌ست) با معادل انگلیسی‌اش.",
        "۲. نتایج رو بر اساس سال انتشار مرتب کن و ۵ تا ۷ مقاله‌ی مرتبط‌تر رو مشخص کن.",
        "۳. اگه یه نشریه‌ی خاص توی نتایج پررنگ بود، با jstage_search_journals جزئیات بیشتری ازش بگیر (ISSN، دامنه‌ی موضوعی).",
        "۴. برای مقاله‌هایی که به‌نظر کلیدی می‌رسن، با jstage_fetch_article_abstract_and_references سعی کن Abstract و بخشی از منابع رو هم دربیاری (توجه: فقط برای بعضی نشریات open-access جواب می‌ده).",
        "۵. یه خلاصه‌ی ساختاریافته از وضعیت فعلی پژوهش روی این موضوع بنویس: چه زیرشاخه‌هایی پررنگ‌ترن، چه سال‌هایی بیشترین انتشار رو داشتن.",
        "۶. برای هر مقاله‌ای که معرفی می‌کنی، لینک یا DOI رو هم بده تا در صورت نیاز به متن کامل مراجعه بشه.",
      ];

      const steps = depth === "quick" ? quickSteps : thoroughSteps;

      const bilingualHint =
        "💡 یادت باشه: بیشتر محتوای J-STAGE ژاپنی‌زبانه. اگه کلیدواژه‌ی انگلیسی نتیجه‌ی کمی داد، " +
        "معادل ژاپنی‌اش رو هم امتحان کن (یا برعکس).";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `## 🔎 برنامه‌ی تحقیق: «${topic}»`,
                "",
                previewLine + yearNote,
                "",
                bilingualHint,
                "",
                `### مراحل (حالت ${depth === "quick" ? "سریع" : "کامل"}):`,
                ...steps,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}