import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchAndParseArticleText } from "../services/jstage/textExtractor.js";

/**
 * این Prompt خودش خلاصه‌سازی یا ترجمه انجام نمی‌ده — چون سرور MCP یه مدل زبانی
 * نیست، فقط یه پل به API خامه. کاری که می‌کنه: چکیده‌ی واقعی مقاله رو با
 * بیشترین اطمینان ممکن دربیاره، و بعد با یه دستورالعمل صریح، از Claude
 * (که داره این prompt رو اجرا می‌کنه) می‌خواد که:
 *   ۱. هرگز کلمه‌به‌کلمه ترجمه نکنه — یه خلاصه‌ی روان و طبیعی فارسی بنویسه
 *   ۲. اگه سوالی داده شده، دقیقاً بر پایه‌ی همون چکیده (نه حدس) جواب بده
 */
export function registerSummarizeAndQaPrompt(server: McpServer): void {
  server.registerPrompt(
    "jstage_summarize_and_qa",
    {
      title: "خلاصه‌سازی و پرسش‌وپاسخ فارسی روی مقاله‌ی J-STAGE",
      description:
        "چکیده‌ی یه مقاله رو می‌گیره و از Claude می‌خواد یه خلاصه‌ی روان و طبیعی فارسی " +
        "(نه ترجمه‌ی تحت‌اللفظی) بنویسه، و اگه سوالی داده بشه، بهش به فارسی و دقیقاً " +
        "بر پایه‌ی همون چکیده پاسخ بده.",
      argsSchema: {
        article_link: z
          .string()
          .url()
          .describe(
            "لینک مقاله (از فیلد article_link.en یا article_link.ja که jstage_search_articles برمی‌گردونه)"
          ),
        question: z
          .string()
          .optional()
          .describe(
            "سوال اختیاری به فارسی درباره‌ی این مقاله. اگه خالی باشه، فقط خلاصه‌سازی انجام می‌شه."
          ),
      },
    },
    async ({ article_link, question }) => {
      const result = await fetchAndParseArticleText(article_link, 10);

      if (!result.available || !result.abstract) {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text:
                  "متأسفانه نتونستیم چکیده‌ی این مقاله رو به‌طور خودکار دربیاریم " +
                  `(${result.note}). لطفاً به Claude بگو صریحاً همین رو به کاربر اطلاع بده ` +
                  "و پیشنهاد بده که خودش لینک مقاله رو باز کنه و متن چکیده رو مستقیم پیست کنه " +
                  "تا بشه روش کار کرد — به‌جای این‌که حدس بزنه محتوای مقاله چیه.",
              },
            },
          ],
        };
      }

      const referencesBlock =
        result.references && result.references.length > 0
          ? `\n\nفهرست بخشی از منابع مقاله (در صورت نیاز به ارجاع‌دهی):\n${result.references
              .map((r, i) => `${i + 1}. ${r}`)
              .join("\n")}`
          : "";

            
      const instructionForSummary = [
        "متن زیر چکیده‌ی اصلی یه مقاله‌ی علمیه (به زبان اصلی مقاله؛ انگلیسی یا ژاپنی):",
        "",
        `«${result.abstract}»`,
        referencesBlock,
        "",
        "لطفاً این کارها رو انجام بده:",
        "",
        "۱. یه خلاصه‌ی **روان، طبیعی و دقیق به زبان فارسی** از این چکیده بنویس. " +
          "⚠️ خیلی مهم: این کار **ترجمه‌ی کلمه‌به‌کلمه یا تحت‌اللفظی نیست** — " +
          "ساختار جمله‌های زبان مبدأ رو کپی نکن. مفهوم، یافته‌های اصلی، و نتیجه‌گیری مقاله رو " +
          "با نثر علمی روان و طبیعی فارسی (همون‌طور که یه محقق فارسی‌زبان می‌نویسه) بازگو کن.",
        "۲. اصطلاحات تخصصی رو به معادل رایج فارسی برگردون (نه معادل تحت‌اللفظی)، و اگه معادل " +
          "جا‌افتاده‌ای نداره، اصطلاح اصلی رو داخل پرانتز نگه دار.",
      ];

      if (question) {
        instructionForSummary.push(
          "",
          `۳. بعد از خلاصه، به این سوال کاربر **به فارسی** پاسخ بده: «${question}»`,
          "پاسخ باید دقیقاً بر پایه‌ی همین چکیده باشه — نه دانش قبلی یا حدس. " +
            "اگه چکیده جواب این سوال رو نداره، صریحاً بگو «این اطلاعات در چکیده موجود نیست» " +
            "به‌جای این‌که حدس بزنی یا از دانش عمومی خودت پر کنی."
        );
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: instructionForSummary.join("\n"),
            },
          },
        ],
      };
    }
  );
}
