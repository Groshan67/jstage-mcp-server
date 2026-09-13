import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * راه‌های گرفتن Abstract/References از J-STAGE (هیچ‌کدوم رسمی نیست، همه best-effort):
 *
 * ۱. Abstract: از متاتگ‌های SEO یا محتوای DOM صفحه‌ی مقاله.
 *
 * ۲. References: از متاتگ‌های استاندارد `citation_reference` (بخشی از اسکیمای
 *    معروف Highwire/Google Scholar که ناشرهای علمی برای ایندکس شدن توسط Google
 *    Scholar، Zotero و Mendeley استفاده می‌کنن). این متاتگ‌ها *سمت سرور* رندر
 *    می‌شن — برخلاف لیست نمایشی توی body که با جاوااسکریپت پر می‌شه — پس با
 *    یه fetch ساده هم در دسترسن. تأیید شده با تست واقعی curl روی یه مقاله‌ی
 *    J-STAGE که ۴ تا citation_reference دقیقاً منطبق با ۴ تا رفرنس واقعی مقاله
 *    برگردوند.
 */

// چون MCP Inspector معمولاً stderr پروسه‌ی سرور رو خودش می‌گیره و توی UI
// مرورگر نشون می‌ده (نه توی ترمینال)، برای دیباگ مطمئن‌تره لاگ رو مستقیم
// توی یه فایل بنویسیم.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEBUG_LOG_PATH = join(__dirname, "..", "..", "debug.log");

function debugLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync(DEBUG_LOG_PATH, line, "utf-8");
  } catch {
    console.error(message);
  }
}

async function fetchUtf8(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "jstage-mcp-server/0.5.0" },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return null;
  }
}

// این متن دقیقاً همون توضیح ثابت و سراسری J-STAGE‌ه (نه چکیده‌ی یه مقاله‌ی خاص).
const KNOWN_SITE_BOILERPLATE = [
  "access full-text academic articles",
  "j-stage is an online platform",
];

function looksLikeSiteBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  return KNOWN_SITE_BOILERPLATE.some((phrase) => lower.includes(phrase));
}

function extractAbstractFromDom($: CheerioAPI): string | undefined {
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
    if (text.length > 40 && !looksLikeSiteBoilerplate(text)) {
      debugLog(`[abstract] ✅ قبول شد از selector "${selector}"`);
      return text;
    }
  }

  const headingMatch = $("h1, h2, h3, h4, dt, strong, b").filter((_, el) => {
    const t = $(el).text().trim();
    return /^(abstract|抄録)$/i.test(t);
  });
  if (headingMatch.length > 0) {
    let next = headingMatch.first().next();
    for (let i = 0; i < 3 && next.length; i++) {
      const text = next.text().trim().replace(/\s+/g, " ");
      if (text.length > 40 && !looksLikeSiteBoilerplate(text)) {
        debugLog("[abstract] ✅ قبول شد از heading sibling");
        return text;
      }
      next = next.next();
    }
  }

  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content");
  if (
    metaDescription &&
    metaDescription.trim().length > 40 &&
    !looksLikeSiteBoilerplate(metaDescription)
  ) {
    debugLog("[abstract] ✅ قبول شد از meta description");
    return metaDescription.trim();
  }

  debugLog("[abstract] ❌ هیچ heuristic ای جواب نداد.");
  return undefined;
}

/**
 * یه content مثل:
 * "citation_author=Y Tatsuoka; citation_title=...; citation_publication_date=2005;
 *  citation_journal_title=Headache Care; citation_volume=2; citation_firstpage=145;
 *  citation_lastpage=149"
 * رو به یه رشته‌ی خوانا مثل:
 * "Y Tatsuoka (2005). Headache in a Japanese... Headache Care, 2, 145-149."
 * تبدیل می‌کنه. اگه content این فرمت key=value نبود (بعضی رفرنس‌های کتابی
 * ژاپنی فقط متن خامن، نه ساختاریافته)، همون متن خام رو برمی‌گردونه.
 */
function formatCitationReference(rawContent: string): string {
  const isStructured = /citation_\w+\s*=/.test(rawContent);
  if (!isStructured) {
    return rawContent.trim();
  }

  const fields: Record<string, string> = {};
  for (const part of rawContent.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key && value) fields[key] = value;
  }

  const author = fields["citation_author"];
  const title = fields["citation_title"];
  const year = fields["citation_publication_date"];
  const journal = fields["citation_journal_title"];
  const volume = fields["citation_volume"];
  const firstpage = fields["citation_firstpage"];
  const lastpage = fields["citation_lastpage"];

  const pages = firstpage ? (lastpage ? `${firstpage}-${lastpage}` : firstpage) : "";
  const parts = [
    author,
    year ? `(${year})` : "",
    title ? `${title}.` : "",
    journal,
    volume,
    pages,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : rawContent.trim();
}

/**
 * فهرست منابع رو از متاتگ‌های استاندارد citation_reference درمیاره —
 * سمت سرور رندر می‌شن، پس با یه fetch ساده (بدون نیاز به اجرای جاوااسکریپت)
 * هم در دسترسن.
 */
function extractReferencesFromMeta(
  $: CheerioAPI,
  maxReferences: number
): { references: string[]; totalReferencesFound: number } {
  const metaTags = $('meta[name="citation_reference"]');
  debugLog(`[references] تعداد متاتگ citation_reference پیدا‌شده: ${metaTags.length}`);

  if (metaTags.length === 0) {
    return { references: [], totalReferencesFound: 0 };
  }

  const references = metaTags
    .map((_, el) => {
      const content = $(el).attr("content") ?? "";
      return formatCitationReference(content);
    })
    .get()
    .filter((r) => r.length > 3);

  debugLog(`[references] ✅ ${references.length} رفرنس از متاتگ استخراج شد`);

  return {
    references: references.slice(0, maxReferences),
    totalReferencesFound: references.length,
  };
}

export interface ExtractedArticleText {
  available: boolean;
  abstract?: string;
  references?: string[];
  totalReferencesFound?: number;
  note: string;
}

export async function fetchAndParseArticleText(
  articleLink: string,
  maxReferences: number
): Promise<ExtractedArticleText> {
  debugLog(`[main] در حال fetch صفحه‌ی مقاله: ${articleLink}`);
  const html = await fetchUtf8(articleLink);

  let abstract: string | undefined;
  let references: string[] = [];
  let totalReferencesFound = 0;

  if (html) {
    debugLog(`[main] HTML دریافت شد، طول: ${html.length} کاراکتر`);
    const $ = cheerio.load(html);
    abstract = extractAbstractFromDom($);
    const metaRefs = extractReferencesFromMeta($, maxReferences);
    references = metaRefs.references;
    totalReferencesFound = metaRefs.totalReferencesFound;
  } else {
    debugLog("[main] fetch صفحه‌ی مقاله شکست خورد یا HTML خالی بود.");
  }

  if (!abstract && references.length === 0) {
    return {
      available: false,
      note:
        "نه چکیده نه رفرنسی پیدا نشد. برای این مقاله باید مستقیم از لینک/DOI به سایت ناشر مراجعه کنی.",
    };
  }

  return {
    available: true,
    abstract,
    references,
    totalReferencesFound,
    note:
      (abstract ? "چکیده از صفحه‌ی مقاله استخراج شد. " : "چکیده پیدا نشد. ") +
      (references.length > 0
        ? `${references.length} از ${totalReferencesFound} رفرنس از متاتگ citation_reference استخراج شد.`
        : "رفرنسی پیدا نشد (این مقاله متاتگ citation_reference نداره)."),
  };
}