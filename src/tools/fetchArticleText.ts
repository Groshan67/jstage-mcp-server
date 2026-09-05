import { z } from "zod";
import { fetchAndParseArticleText } from "../services/jstage/textExtractor.js";

export const fetchArticleTextSchema = {
  article_link: z
    .string()
    .url()
    .describe(
      "فیلد link همون مقاله‌ای که از jstage_search_articles گرفتی " +
        "(چیزی شبیه https://www.jstage.jst.go.jp/article/{cdjournal}/{vol}/{no}/{id}/_article/-char/en)"
    ),
  max_references: z
    .number()
    .min(1)
    .max(50)
    .default(15)
    .describe("حداکثر تعداد رفرنسی که برگردونده بشه (نه لزوماً کل لیست منابع)"),
};

export async function fetchArticleTextHandler(
  args: z.infer<z.ZodObject<typeof fetchArticleTextSchema>>
) {
  const result = await fetchAndParseArticleText(
    args.article_link,
    args.max_references
  );

  if (!result.available) {
    return {
      content: [{ type: "text" as const, text: result.note }],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            abstract: result.abstract ?? "(پیدا نشد)",
            references: result.references ?? [],
            totalReferencesFound: result.totalReferencesFound,
            note: result.note,
          },
          null,
          2
        ),
      },
    ],
  };
}
