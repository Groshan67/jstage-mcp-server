/**
 * بعضی نشریات J-STAGE (نه همه، بستگی به تنظیمات ناشر داره) یه نسخه‌ی متنیِ
 * ساده (txt) از مقاله رو مستقیم از طریق یه URL خاص منتشر می‌کنن:
 *
 *   https://www.jstage.jst.go.jp/article/{cdjournal}/{vol}/{no}/{articleId}/_article/-char/{lang}
 *   →  همون آدرس با یه بخش download/ اضافه:
 *   https://www.jstage.jst.go.jp/article/{cdjournal}/{vol}/{no}/{articleId}/_article/download/-char/{lang}
 *
 * این تابع سعی می‌کنه از روی لینک صفحه‌ی مقاله (که در نتیجه‌ی jstage_search_articles
 * برمی‌گرده)، آدرس نسخه‌ی txt رو بسازه. اگه الگوی لینک مطابقت نداشته باشه، null برمی‌گردونه
 * (یعنی این قابلیت برای اون مقاله/نشریه پشتیبانی نمی‌شه).
 *
 * ⚠️ نکته‌ی مهم: این یه رفتار مستندنشده‌ی سطح وب‌سایته، نه بخشی از J-STAGE WebAPI رسمی.
 * فقط برای نشریاتی کار می‌کنه که این‌جوری منتشرش کردن (معمولاً نشریات کاملاً open-access).
 * برای هر نشریه/فرمت جدید ممکنه نیاز به تنظیم این تابع باشه.
 */
export function buildTextDownloadUrl(articleLink: string): string | null {
  try {
    const url = new URL(articleLink);
    // الگوی موردانتظار: .../_article/-char/xx  (با یا بدون اسلش انتهایی)
    const match = url.pathname.match(/^(.*\/_article)\/-char\/([a-z]{2})\/?$/);
    if (!match) return null;

    const [, basePath, lang] = match;
    url.pathname = `${basePath}/download/-char/${lang}`;
    return url.toString();
  } catch {
    return null;
  }
}

export interface ExtractedArticleText {
  available: boolean;
  abstract?: string;
  references?: string[];
  totalReferencesFound?: number;
  note: string;
}

/**
 * توی متن ساده‌ی txt، به‌صورت heuristic دنبال بخش Abstract و References می‌گرده.
 * چون این متن از OCR/تبدیل PDF میاد، فرمت دقیق بین نشریات مختلف فرق می‌کنه —
 * این یه best-effort parsing‌ه، نه یه پارسر تضمین‌شده.
 */
function parseArticleText(
  raw: string,
  maxReferences: number
): { abstract?: string; references: string[]; totalReferencesFound: number } {
  const text = raw.replace(/\r\n/g, "\n");

  // --- Abstract ---
  // دنبال یه خط مستقل "Abstract" (یا "抄録" برای ژاپنی) می‌گردیم، تا قبل از
  // اولین heading بعدی (مثل "Keywords" یا "1. Introduction" یا "References")
  let abstract: string | undefined;
  const abstractMatch = text.match(
    /\n\s*(Abstract|抄録)\s*\n([\s\S]*?)\n\s*(Keywords?|キーワード|1\.\s|I\.\s|References|参考文献|Introduction)/i
  );
  if (abstractMatch) {
    abstract = abstractMatch[2].replace(/\s+/g, " ").trim();
  }

  // --- References ---
  let references: string[] = [];
  const refSectionMatch = text.match(
    /\n\s*(References|参考文献)\s*\n([\s\S]*)$/i
  );
  let totalReferencesFound = 0;
  if (refSectionMatch) {
    const refBlock = refSectionMatch[2];
    // اکثر فرمت‌های رفرنس با یه شماره شروع می‌شن: "1)" یا "[1]" یا "1."
    const rawRefs = refBlock
      .split(/\n(?=\s*(?:\[\d+\]|\d+[).]\s))/)
      .map((r) => r.replace(/\s+/g, " ").trim())
      .filter((r) => r.length > 5);

    totalReferencesFound = rawRefs.length;
    references = rawRefs.slice(0, maxReferences);
  }

  return { abstract, references, totalReferencesFound };
}

export async function fetchAndParseArticleText(
  articleLink: string,
  maxReferences: number
): Promise<ExtractedArticleText> {
  const downloadUrl = buildTextDownloadUrl(articleLink);
  if (!downloadUrl) {
    return {
      available: false,
      note:
        "الگوی این لینک با فرمت شناخته‌شده‌ی txt-download مطابقت نداره. " +
        "این قابلیت فقط برای بعضی نشریات J-STAGE (عمدتاً open-access) در دسترسه؛ " +
        "برای این مقاله باید مستقیم از فیلد link/doi به سایت ناشر مراجعه کنی.",
    };
  }

  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      headers: { "User-Agent": "jstage-mcp-server/0.2.0" },
    });
  } catch (err) {
    return {
      available: false,
      note: `درخواست به J-STAGE با خطا مواجه شد: ${(err as Error).message}`,
    };
  }

  if (!response.ok) {
    return {
      available: false,
      note: `نسخه‌ی متنی برای این مقاله در دسترس نیست (HTTP ${response.status}). احتمالاً این نشریه این قابلیت رو فعال نکرده.`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  // اگه پاسخ HTML باشه (نه txt خام)، یعنی این مقاله اصلاً نسخه‌ی متنی نداره
  // و J-STAGE به‌جاش صفحه‌ی خطا/چکیده برگردونده.
  if (contentType.includes("html") || raw.trim().startsWith("<!DOCTYPE")) {
    return {
      available: false,
      note: "این مقاله نسخه‌ی txt نداره؛ J-STAGE به‌جای فایل متنی یه صفحه‌ی HTML برگردوند.",
    };
  }

  const { abstract, references, totalReferencesFound } = parseArticleText(
    raw,
    maxReferences
  );

  if (!abstract && references.length === 0) {
    return {
      available: false,
      note:
        "فایل متنی دریافت شد ولی نتونستیم بخش Abstract یا References رو داخلش پیدا کنیم " +
        "(احتمالاً فرمت این نشریه با الگوی heuristic فعلی فرق داره).",
    };
  }

  return {
    available: true,
    abstract,
    references,
    totalReferencesFound,
    note:
      references.length < totalReferencesFound
        ? `فقط ${references.length} مورد از مجموع ${totalReferencesFound} رفرنس برگردونده شده (برای کنترل حجم خروجی).`
        : "استخراج کامل انجام شد.",
  };
}

