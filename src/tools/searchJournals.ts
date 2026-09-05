import { z } from "zod";
import { queryJStage, JStageApiError } from "../services/jstage/client.js";

export const searchJournalsSchema = {
  journal_name: z
    .string()
    .optional()
    .describe("نام نشریه یا بخشی از آن (تطبیق جزئی، بدون حساسیت به حروف بزرگ/کوچک)"),
  issn: z.string().optional().describe("ISSN دقیق نشریه"),
  publication_type: z
    .number()
    .optional()
    .describe("کد نوع انتشار طبق مستندات J-STAGE (مثلاً 100 = ژورنال علمی)"),
  start: z.number().min(1).default(1),
  count: z.number().min(1).max(200).default(20),
  lang: z.enum(["ja", "en"]).default("ja"),
};

export async function searchJournalsHandler(
  args: z.infer<z.ZodObject<typeof searchJournalsSchema>>
) {
  try {
    const result = await queryJStage({
      service: 1,
      material: args.journal_name,
      issn: args.issn,
      pubtype: args.publication_type,
      start: args.start,
      count: args.count,
      lang: args.lang,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              totalResults: result.totalResults,
              returnedCount: result.entries.length,
              journals: result.entries,
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
