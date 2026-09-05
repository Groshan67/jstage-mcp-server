import { z } from "zod";
import { queryJStage, JStageApiError } from "../services/jstage/client.js";

export const searchArticlesSchema = {
  keyword: z
    .string()
    .optional()
    .describe(
      "کلیدواژه‌ی آزاد برای جستجو در متادیتای مقاله (عنوان/چکیده/متن نمایه‌شده)"
    ),
  article_title: z.string().optional().describe("جستجوی دقیق‌تر در عنوان مقاله"),
  author: z.string().optional().describe("نام نویسنده (تطبیق جزئی)"),
  affiliation: z.string().optional().describe("وابستگی سازمانی نویسنده"),
  journal_name: z
    .string()
    .optional()
    .describe("نام نشریه (تطبیق جزئی، مثلاً بخشی از نام مجله)"),
  issn: z.string().optional().describe("ISSN دقیق نشریه، اگه می‌دونی سریع‌تره"),
  pub_year_from: z.number().optional().describe("سال شروع بازه‌ی انتشار (YYYY)"),
  pub_year_to: z.number().optional().describe("سال پایان بازه‌ی انتشار (YYYY)"),
  start: z
    .number()
    .min(1)
    .default(1)
    .describe("شماره‌ی رکورد شروع، برای صفحه‌بندی (پیش‌فرض ۱)"),
  count: z
    .number()
    .min(1)
    .max(200)
    .default(20)
    .describe("تعداد نتیجه در این صفحه (حداکثر ۲۰۰)"),
  lang: z
    .enum(["ja", "en"])
    .default("ja")
    .describe("زبان ترجیحی متادیتا در پاسخ (بیشتر محتوای J-STAGE ژاپنیه)"),
};

export async function searchArticlesHandler(
  args: z.infer<z.ZodObject<typeof searchArticlesSchema>>
) {
  try {
    const result = await queryJStage({
      service: 3,
      keyword: args.keyword,
      article: args.article_title,
      author: args.author,
      affil: args.affiliation,
      material: args.journal_name,
      issn: args.issn,
      pubyearfrom: args.pub_year_from,
      pubyearto: args.pub_year_to,
      start: args.start,
      count: args.count,
      lang: args.lang,
    });

    if (result.entries.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "هیچ مقاله‌ای با این معیارها پیدا نشد. توجه کن که محتوای J-STAGE عمدتاً ژاپنی‌زبانه؛ اگه با کلیدواژه انگلیسی جستجو کردی، امتحان کن با معادل ژاپنی یا فقط با ISSN/نام دقیق نشریه جستجو کنی.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              totalResults: result.totalResults,
              startIndex: result.startIndex,
              returnedCount: result.entries.length,
              note: "J-STAGE فقط متادیتا برمی‌گردونه؛ برای متن کامل باید از فیلد link یا doi هر رکورد به سایت ناشر مراجعه کنی.",
              articles: result.entries,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    if (err instanceof JStageApiError) {
      return {
        content: [{ type: "text" as const, text: `خطا در ارتباط با J-STAGE: ${err.message}` }],
        isError: true,
      };
    }
    throw err;
  }
}
