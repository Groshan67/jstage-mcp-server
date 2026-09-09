import * as cheerio from "cheerio";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * دو راه برای گرفتن Abstract/References از J-STAGE:
 *
 * ۱. صفحه‌ی معمولی مقاله (article_link که همیشه توی نتیجه‌ی جستجو هست) —
 *    این universal‌تره چون تقریباً همه‌ی نشریات چکیده رو توی این صفحه نشون
 *    می‌دن (حتی مقالات پولی)، برخلاف نسخه‌ی txt که فقط بعضی نشریات دارن.
 *
 * ۲. نسخه‌ی txt (فقط برای نشریات open-access که این قابلیت رو فعال کردن) —
 *    عمدتاً برای گرفتن References استفاده می‌شه، چون صفحه‌ی معمولی معمولاً
 *    فهرست منابع رو نشون نمی‌ده.
 *
 * هر دو best-effort و heuristic هستن؛ نه بخشی از J-STAGE WebAPI رسمی.
 */

// چون MCP Inspector معمولاً stderr پروسه‌ی سرور رو خودش می‌گیره و توی UI
// مرورگر نشون می‌ده (نه توی ترمینال)، برای دیباگ مطمئن‌تره لاگ رو مستقیم
// توی یه فایل بنویسیم — مستقل از این‌که Inspector/ترمینال/WSL چیکار می‌کنن.
// فایل کنار build/ ساخته می‌شه: debug.log
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEBUG_LOG_PATH = join(__dirname, "..", "..", "debug.log");

function debugLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync(DEBUG_LOG_PATH, line, "utf-8");
  } catch {
    // اگه نوشتن فایل هم شکست خورد، حداقل stderr رو امتحان کن
    console.error(message);
  }
}

async function fetchUtf8(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "jstage-mcp-server/0.3.0" },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return null;
  }
}

// این متن دقیقاً همون توضیح ثابت و سراسری J-STAGE‌ه (نه چکیده‌ی یه مقاله‌ی خاص) —
// یه‌بار با meta description اشتباهی گرفتیم، برای همین صریح فیلترش می‌کنیم.
const KNOWN_SITE_BOILERPLATE = [
  "access full-text academic articles",
  "j-stage is an online platform",
];

function looksLikeSiteBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  return KNOWN_SITE_BOILERPLATE.some((phrase) => lower.includes(phrase));
}

/**
 * از صفحه‌ی معمولی مقاله، چکیده رو با چندتا heuristic پشت‌سرهم امتحان می‌کنه.
 * ترتیب مهمه: اول سراغ محتوای واقعی صفحه (که مخصوص همین مقاله‌ست) می‌ریم،
 * و متاتگ‌های SEO رو آخر صف می‌ذاریم چون یه‌بار دیدیم ممکنه فقط توضیح
 * ثابت و سراسری کل سایت باشن، نه چکیده‌ی واقعی این مقاله.
 */
async function extractAbstractFromArticlePage(
  articleLink: string
): Promise<string | undefined> {
  debugLog(`[textExtractor] در حال fetch کردن: ${articleLink}`);
  const html = await fetchUtf8(articleLink);
  if (!html) {
    debugLog("[textExtractor] fetch شکست خورد یا HTML خالی بود.");
    return undefined;
  }
  debugLog(`[textExtractor] HTML دریافت شد، طول: ${html.length} کاراکتر`);

  const $ = cheerio.load(html);

  // heuristic ۱ (اولویت اول): عنصر با id/class شامل "abstract"
  const abstractSelectors = [
    "#ABSTRACT",
    ".abstract",
    'section[class*="abstract" i]',
    'div[class*="abstract" i]',
    'div[id*="abstract" i]',
    'p[class*="abstract" i]',
  ];
  for (const selector of abstractSelectors) {
    const el = $(selector).first();
    const text = el.text().trim().replace(/\s+/g, " ");
    debugLog(
      `[textExtractor] selector "${selector}" → طول متن: ${text.length}, نمونه: "${text.slice(0, 80)}"`
    );
    if (text.length > 40 && !looksLikeSiteBoilerplate(text)) {
      debugLog(`[textExtractor] ✅ قبول شد از selector "${selector}"`);
      return text;
    }
  }

  // heuristic ۲: یه heading با متن "Abstract"/"抄録" که پاراگراف بعدیش رو می‌گیریم
  const headingMatch = $("h1, h2, h3, h4, dt, strong, b").filter((_, el) => {
    const t = $(el).text().trim();
    return /^(abstract|抄録)$/i.test(t);
  });
  debugLog(`[textExtractor] تعداد heading های "Abstract" پیدا‌شده: ${headingMatch.length}`);
  if (headingMatch.length > 0) {
    let next = headingMatch.first().next();
    // بعضی صفحات چندتا تگ خالی/wrapper بین heading و متن اصلی دارن
    for (let i = 0; i < 3 && next.length; i++) {
      const text = next.text().trim().replace(/\s+/g, " ");
      debugLog(
        `[textExtractor] heading+${i + 1} sibling → طول: ${text.length}, نمونه: "${text.slice(0, 80)}"`
      );
      if (text.length > 40 && !looksLikeSiteBoilerplate(text)) {
        debugLog(`[textExtractor] ✅ قبول شد از heading sibling`);
        return text;
      }
      next = next.next();
    }
  }

  // heuristic ۳ (آخرین امید): متاتگ‌های SEO — فقط اگه boilerplate شناخته‌شده نباشن
  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content");
  debugLog(
    `[textExtractor] meta description: "${(metaDescription ?? "").slice(0, 100)}"`
  );
  if (
    metaDescription &&
    metaDescription.trim().length > 40 &&
    !looksLikeSiteBoilerplate(metaDescription)
  ) {
    debugLog("[textExtractor] ✅ قبول شد از meta description");
    return metaDescription.trim();
  }

  debugLog("[textExtractor] ❌ هیچ heuristic ای جواب نداد.");
  return undefined;
}

function buildTextDownloadUrl(articleLink: string): string | null {
  try {
    const url = new URL(articleLink);
    const match = url.pathname.match(/^(.*\/_article)\/-char\/([a-z]{2})\/?$/);
    if (!match) return null;
    const [, basePath, lang] = match;
    url.pathname = `${basePath}/download/-char/${lang}`;
    return url.toString();
  } catch {
    return null;
  }
}

function parseReferencesFromRawText(
  raw: string,
  maxReferences: number
): { references: string[]; totalReferencesFound: number } {
  const text = raw.replace(/\r\n/g, "\n");
  const refSectionMatch = text.match(/\n\s*(References|参考文献)\s*\n([\s\S]*)$/i);
  if (!refSectionMatch) return { references: [], totalReferencesFound: 0 };

  const refBlock = refSectionMatch[2];
  const rawRefs = refBlock
    .split(/\n(?=\s*(?:\[\d+\]|\d+[).]\s))/)
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter((r) => r.length > 5);

  return {
    references: rawRefs.slice(0, maxReferences),
    totalReferencesFound: rawRefs.length,
  };
}

export interface ExtractedArticleText {
  available: boolean;
  abstract?: string;
  abstractSource?: "article_page" | "text_download";
  references?: string[];
  totalReferencesFound?: number;
  note: string;
}

export async function fetchAndParseArticleText(
  articleLink: string,
  maxReferences: number
): Promise<ExtractedArticleText> {
  // مرحله‌ی ۱: چکیده از صفحه‌ی معمولی مقاله (universal، برای تقریباً همه‌ی مقالات)
  const htmlAbstract = await extractAbstractFromArticlePage(articleLink);

  // مرحله‌ی ۲: تلاش برای گرفتن References از نسخه‌ی txt (فقط بعضی نشریات)
  let references: string[] = [];
  let totalReferencesFound = 0;
  let txtNote = "";

  const downloadUrl = buildTextDownloadUrl(articleLink);
  if (downloadUrl) {
    const rawText = await fetchUtf8(downloadUrl);
    if (rawText && !rawText.trim().startsWith("<!DOCTYPE")) {
      const parsed = parseReferencesFromRawText(rawText, maxReferences);
      references = parsed.references;
      totalReferencesFound = parsed.totalReferencesFound;
    } else {
      txtNote = " (نسخه‌ی متنی برای گرفتن References در دسترس نبود.)";
    }
  } else {
    txtNote = " (این نشریه نسخه‌ی txt نداره، پس References در دسترس نیست.)";
  }

  if (!htmlAbstract && references.length === 0) {
    return {
      available: false,
      note:
        "نه از صفحه‌ی مقاله تونستیم چکیده رو پیدا کنیم، نه نسخه‌ی txt برای References در دسترس بود. " +
        "برای این مقاله باید مستقیم از لینک/DOI به سایت ناشر مراجعه کنی.",
    };
  }

  return {
    available: true,
    abstract: htmlAbstract,
    abstractSource: htmlAbstract ? "article_page" : undefined,
    references,
    totalReferencesFound,
    note:
      (htmlAbstract ? "چکیده از صفحه‌ی مقاله استخراج شد." : "چکیده پیدا نشد.") +
      (references.length > 0
        ? ` ${references.length} از ${totalReferencesFound} رفرنس هم برگردونده شد.`
        : txtNote),
  };
}