import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * یه Resource ثابت که اطلاعات کلی درباره‌ی J-STAGE و محدودیت‌های این سرور رو
 * در اختیار کلاینت می‌ذاره. برخلاف Tool که مدل خودش تصمیم می‌گیره کِی صداش بزنه،
 * Resource رو خودِ اپلیکیشن (مثلاً Claude Desktop) می‌تونه لیست کنه و به کاربر
 * پیشنهاد بده که به‌عنوان context ضمیمه‌ی گفتگو بشه.
 */
export function registerJStageInfoResource(server: McpServer): void {
  server.registerResource(
    "jstage-database-info",
    "jstage://database/info",
    {
      title: "J-STAGE Database Info",
      description:
        "اطلاعات کلی درباره‌ی پلتفرم J-STAGE، محدودیت‌ها و نحوه‌ی صحیح استفاده از ابزارهای این سرور",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: [
            "J-STAGE (Japan Science and Technology Information Aggregator, Electronic)",
            "اداره‌شده توسط JST (آژانس علم و تکنولوژی ژاپن) — https://www.jstage.jst.go.jp",
            "",
            "محدودیت‌های مهم:",
            "- این سرور در حالت عادی فقط متادیتا برمی‌گردونه (عنوان، نویسنده، چکیده، DOI، لینک)، نه متن کامل مقاله.",
            "- ابزار fetchArticleText یه استثناست: تلاش می‌کنه Abstract و بخشی از References رو هم دربیاره،",
            "  ولی فقط برای بعضی نشریات open-access جواب می‌ده (چون بر پایه‌ی یه نسخه‌ی txt غیررسمیه).",
            "- برای متن کامل مقاله (بدنه‌ی اصلی)، باز هم باید از فیلد link یا doi هر نتیجه به سایت ناشر مراجعه کرد.",
            "- بیشتر محتوای J-STAGE به زبان ژاپنی‌ست؛ جستجوی کلیدواژه‌ی ژاپنی نتیجه‌ی بهتری می‌ده.",
            "- طبق سیاست مرورگری J-STAGE، دانلود انبوه (bulk download) ممنوعه؛ این سرور خودش",
            "  محدودیت نرخ درخواست (throttle) و سقف تعداد نتیجه در هر فراخوانی رو اعمال می‌کنه.",
          ].join("\n"),
        },
      ],
    })
  );
}
