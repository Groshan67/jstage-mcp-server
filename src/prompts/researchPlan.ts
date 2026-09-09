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
      title: "برنامه‌ی تحقیق روی J-STAGE و PubMed",
      description:
        "یه برنامه‌ی جستجوی چندمرحله‌ای و آماده روی J-STAGE و/یا PubMed برای یه موضوع مشخص می‌سازه — " +
        "شامل پیش‌نمایش تعداد نتایج (فقط J-STAGE)، راهبرد جستجوی دوزبانه، و مراحل مشخص برای Claude تا دنبال کنه.",
      argsSchema: {
        topic: completable(
          z
            .string()
            .describe(
              "موضوع تحقیق (ترجیحاً ژاپنی یا انگلیسی؛ چندتا نمونه‌ی رایج برای autocomplete در دسترسه)"
            ),
          async (value) => matchSuggestions(value)
        ),
        source: z
          .enum(["jstage", "pubmed", "both"])
          .default("both")
          .describe(
            "jstage = فقط J-STAGE (بیشتر محتوای ژاپنی)؛ pubmed = فقط PubMed (زیست‌پزشکی)؛ " +
              "both = هر دو منبع (پیش‌فرض، برای دید کامل‌تر روی موضوع)"
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
    async ({ topic, source, depth, pub_year_from }) => {
      const yearFrom = pub_year_from ? Number(pub_year_from) : undefined;

      let totalResults: number | undefined;
      let topJournal: string | undefined;
      if (source !== "pubmed") {
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
      }

      const previewLine =
        source === "pubmed"
          ? "📊 پیش‌نمایش زنده برای PubMed در این پرامپت در دسترس نیست — Claude خودش موقع اجرا با PubMed:search_articles تعداد نتایج رو می‌بینه."
          : totalResults !== undefined
          ? `📊 در حال حاضر حدود **${formatNumber(totalResults)}** نتیجه برای «${topic}» در J-STAGE ثبت شده${
              topJournal ? ` (یکی از نشریات پرتکرار: ${topJournal})` : ""
            }.`
          : "📊 پیش‌نمایش اولیه‌ی J-STAGE در دسترس نبود — ولی برنامه‌ی زیر رو مستقل از اون دنبال کن.";

      const yearNote = yearFrom
        ? `\n🗓️ فقط مقالات از سال ${yearFrom} به بعد رو در نظر بگیر.`
        : "";

      const jstageQuickSteps = [
        "با jstage_search_articles یه جستجوی سریع بزن (حداکثر ۱۰ نتیجه کافیه).",
        "سه مقاله‌ی مرتبط‌تر رو بر اساس عنوان و سال انتخاب کن.",
        "یه خلاصه‌ی دو-سه خطی از یافته‌ها بده، همراه با لینک/DOI هر مقاله.",
      ];

      const jstageThoroughSteps = [
        "با jstage_search_articles روی این موضوع جستجو کن — هم با کلیدواژه‌ی اصلی، هم (اگه موضوع بین‌المللی‌ست) با معادل انگلیسی‌اش.",
        "نتایج رو بر اساس سال انتشار مرتب کن و ۵ تا ۷ مقاله‌ی مرتبط‌تر رو مشخص کن.",
        "اگه یه نشریه‌ی خاص توی نتایج پررنگ بود، با jstage_search_journals جزئیات بیشتری ازش بگیر (ISSN، دامنه‌ی موضوعی).",
        "برای مقاله‌هایی که به‌نظر کلیدی می‌رسن، با jstage_fetch_article_abstract_and_references سعی کن Abstract و بخشی از منابع رو هم دربیاری (توجه: فقط برای بعضی نشریات open-access جواب می‌ده).",
        "برای هر مقاله‌ای که معرفی می‌کنی، لینک یا DOI رو هم بده تا در صورت نیاز به متن کامل مراجعه بشه.",
      ];

      const pubmedQuickSteps = [
        "با PubMed:search_articles یه جستجوی سریع بزن (حداکثر ۱۰ نتیجه، sort=relevance).",
        "سه مقاله‌ی مرتبط‌تر رو با PubMed:get_article_metadata جزئیات‌شون رو بگیر.",
        "یه خلاصه‌ی دو-سه خطی بده؛ طبق سیاست PubMed، حتماً DOI/PMID هر مقاله رو ذکر کن.",
      ];

      const pubmedThoroughSteps = [
        "با PubMed:search_articles جستجو کن (در صورت نیاز از فیلدهایی مثل [Title]، [Author]، [MeSH Terms] هم استفاده کن).",
        "نتایج رو بر اساس ارتباط/تاریخ مرتب کن و ۵ تا ۷ مقاله‌ی کلیدی رو انتخاب کن.",
        "برای هرکدوم با PubMed:get_article_metadata چکیده و جزئیات کامل رو بگیر.",
        "با PubMed:convert_article_ids چک کن کدوم مقاله‌ها PMCID دارن؛ برای اون‌ها با PubMed:get_full_text_article سعی کن متن کامل رو هم دربیاری.",
        "با PubMed:find_related_articles مقالات مشابه/مرتبط رو هم پیدا کن تا تصویر کامل‌تری از حوزه داشته باشی.",
        "طبق سیاست PubMed، همیشه در خلاصه‌ی نهایی DOI/PMID هر مقاله رو ذکر کن.",
      ];

      const sections: string[] = [];
      if (source === "jstage" || source === "both") {
        sections.push(
          `### 🇯🇵 بخش J-STAGE (حالت ${depth === "quick" ? "سریع" : "کامل"}):`,
          ...(depth === "quick" ? jstageQuickSteps : jstageThoroughSteps).map(
            (s, i) => `${i + 1}. ${s}`
          ),
          ""
        );
      }
      if (source === "pubmed" || source === "both") {
        sections.push(
          `### 🧬 بخش PubMed (حالت ${depth === "quick" ? "سریع" : "کامل"}):`,
          ...(depth === "quick" ? pubmedQuickSteps : pubmedThoroughSteps).map(
            (s, i) => `${i + 1}. ${s}`
          ),
          ""
        );
      }
      if (source === "both") {
        sections.push(
          "### 🔗 ترکیب دو منبع:",
          "بعد از جمع‌آوری از هر دو منبع، مقاله‌های تکراری (بر اساس DOI) رو ادغام کن و در خلاصه‌ی نهایی مشخص کن " +
            "کدوم بخش از تصویر کلی از J-STAGE اومده و کدوم از PubMed.",
          ""
        );
      }

      const bilingualHint =
        "💡 یادت باشه: بیشتر محتوای J-STAGE ژاپنی‌زبانه. اگه کلیدواژه‌ی انگلیسی نتیجه‌ی کمی داد، " +
        "معادل ژاپنی‌اش رو هم امتحان کن (یا برعکس). محتوای PubMed معمولاً انگلیسیه.";

      const styleReminder =
        "⚠️ قبل از نوشتن خروجی نهایی به کاربر، پرامپت persian_summary_style رو با متنی که از این مرحله جمع کردی " +
        "(به‌عنوان آرگومان content) صدا بزن — نتیجه نباید ترجمه‌ی تحت‌اللفظی باشه، باید بازنویسی روان فارسی باشه.";

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
                ...sections,
                styleReminder,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}