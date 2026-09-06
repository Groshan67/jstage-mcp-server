import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { queryJStage } from "../services/jstage/client.js";

export function registerResearchPlanPrompt(server: McpServer): void {
  server.registerPrompt(
    "jstage_research_plan",
    {
      title: "J-STAGE Research Plan (برنامه پژوهشی)",
      description:
        "انجام یک تحقیق گام‌به‌گام در J-STAGE: پیدا کردن برترین مقالات، بررسی نشریات مرتبط و ارائه خلاصه‌ای از وضعیت علمی موضوع دلخواه شما.",
      argsSchema: {
        topic: completable(z.string(), async (value) => {
          const suggestions = [
            "人工知能 (هوش مصنوعی - AI)",
            "再生可能エネルギー (انرژی‌های تجدیدپذیر)",
            "遺伝子治療 (ژن‌درمانی)",
            "気候変動 (تغییرات اقلیمی)",
            "ロボット工学 (رباتیک)",
            "高齢化社会 (جامعه سالخورده)",
          ];

          const lowerValue = value.toLowerCase();
          return suggestions.filter((s) =>
            s.toLowerCase().includes(lowerValue)
          );
        }),
        pub_year_from: z.string().optional(),
      },
    },
    async ({ topic, pub_year_from }) => {
      // اگر از لیست انتخاب شده باشد، بخش ژاپنی/انگلیسی استخراج می‌شود.
      // اما اگر کاربر فقط فارسی تایپ کرده باشد، همان کلمه فارسی در این متغیر قرار می‌گیرد.
      const searchKeyword = topic.split(" (")[0].trim();

      // بررسی ساده برای اینکه ببینیم آیا متن شامل حروف فارسی/عربی است یا خیر
      const hasPersianChars = /[\u0600-\u06FF]/.test(searchKeyword);

      let previewNote = "";
      
      // اگر کلمه کاملاً فارسی باشد، API پیش‌نمایش احتمالاً نتیجه‌ای ندارد، پس الکی درخواست نمی‌زنیم
      if (hasPersianChars) {
        previewNote = "(پیش‌نمایش تعداد مقالات برای کلمات فارسی در دسترس نیست، اما دستیار ابتدا آن را ترجمه کرده و سپس جستجو می‌کند)";
      } else {
        try {
          const preview = await queryJStage({
            service: 3,
            keyword: searchKeyword,
            count: 3,
            pubyearfrom: pub_year_from ? Number(pub_year_from) : undefined,
          });
          previewNote = `(در حال حاضر حدود ${preview.totalResults ?? "نامشخص"} نتیجه برای این موضوع در J-STAGE ثبت شده)`;
        } catch {
          previewNote = "(پیش‌نمایش اولیه در دسترس نبود، ولی برنامه‌ی زیر رو دنبال کن)";
        }
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
                "لطفاً این مراحل رو دقیقاً به همین ترتیب دنبال کن:",
                `۱. اگر عبارت «${searchKeyword}» ژاپنی یا انگلیسی نیست، ابتدا آن را به ژاپنی (و در صورت نیاز انگلیسی) ترجمه کن.`,
                "۲. سپس با استفاده از ابزار jstage_search_articles و کلمات کلیدی ترجمه‌شده، جستجوی اولیه را انجام بده.",
                "۳. نتایج رو بر اساس سال انتشار مرتب کن و ۵ مقاله‌ی مرتبط‌تر رو مشخص کن.",
                "۴. اگه یه نشریه‌ی خاص توی نتایج پررنگ بود، با jstage_search_journals جزئیات بیشتری ازش بگیر.",
                "۵. یه خلاصه از وضعیت فعلی پژوهش روی این موضوع (بر اساس چکیده‌ها) بنویس.",
                "۶. برای هر مقاله، لینک یا DOI رو هم بده تا در صورت نیاز به متن کامل مراجعه بشه.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}