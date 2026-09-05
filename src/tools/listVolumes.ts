import { z } from "zod";
import { queryJStage, JStageApiError } from "../services/jstage/client.js";

export const listVolumesSchema = {
  journal_name: z
    .string()
    .optional()
    .describe("نام نشریه (اگه issn یا cdjournal رو نداری از این استفاده کن)"),
  issn: z.string().optional().describe("ISSN دقیق نشریه — سریع‌ترین و دقیق‌ترین راه"),
  journal_code: z
    .string()
    .optional()
    .describe("کد داخلی نشریه در J-STAGE (cdjournal)، اگه از قبل می‌دونی"),
  start: z.number().min(1).default(1),
  count: z.number().min(1).max(200).default(50),
  lang: z.enum(["ja", "en"]).default("ja"),
};

export async function listVolumesHandler(
  args: z.infer<z.ZodObject<typeof listVolumesSchema>>
) {
  if (!args.journal_name && !args.issn && !args.journal_code) {
    return {
      content: [
        {
          type: "text" as const,
          text: "برای گرفتن فهرست شماره‌ها، حداقل یکی از journal_name، issn یا journal_code رو باید بدی.",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await queryJStage({
      service: 2,
      material: args.journal_name,
      issn: args.issn,
      cdjournal: args.journal_code,
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
              volumes: result.entries,
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
