import { XMLParser } from "fast-xml-parser";

/**
 * کلاینت خام J-STAGE WebAPI.
 * مستندات: https://www.jstage.jst.go.jp/static/pages/JstageServices/TAB3/-char/en
 *
 * نکات مهم:
 * - نیازی به API key نیست.
 * - پاسخ به‌صورت XML (فرمت Atom) برمی‌گرده، نه JSON — برای همین پارسش می‌کنیم.
 * - طبق «سیاست مرورگری J-STAGE»، دانلود انبوه (bulk download) ممنوعه.
 *   برای رعایت این قانون، بین هر درخواست یه تاخیر حداقلی می‌ذاریم (شبیه صف NCBI
 *   که توی سرورهای PubMed هم دیدیم) و سقف count رو محدود می‌کنیم.
 */

const BASE_URL = "https://api.jstage.jst.go.jp/searchapi/do";

// حداقل فاصله بین هر درخواست (میلی‌ثانیه) — رعایت ادب نسبت به سرویس رایگان JST
const MIN_REQUEST_DELAY_MS = 500;

// سقف تعداد نتیجه در هر درخواست (برای جلوگیری از دانلود انبوه)
const MAX_COUNT_PER_REQUEST = 200;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_DELAY_MS - elapsed)
    );
  }
  lastRequestTime = Date.now();
}

export type JStageService = 1 | 2 | 3; // 1=نشریه، 2=فهرست شماره، 3=مقاله

export interface JStageQueryParams {
  service: JStageService;
  material?: string; // نام نشریه (partial match)
  article?: string; // عنوان مقاله
  author?: string;
  affil?: string; // وابستگی سازمانی نویسنده
  keyword?: string;
  abst?: string; // جستجو در چکیده
  text?: string; // جستجو در متادیتای متنی
  issn?: string;
  cdjournal?: string; // کد نشریه
  pubyearfrom?: number;
  pubyearto?: number;
  vol?: number;
  no?: number;
  start?: number; // برای صفحه‌بندی، شروع از 1
  count?: number; // حداکثر MAX_COUNT_PER_REQUEST
  sortflg?: number;
  pubtype?: number; // فقط برای service=1 (مثلاً 100 = ژورنال)
  lang?: "ja" | "en";
}

export interface JStageEntry {
  [key: string]: unknown;
}

export interface JStageResponse {
  totalResults?: number;
  startIndex?: number;
  itemsPerPage?: number;
  entries: JStageEntry[];
}

function buildUrl(params: JStageQueryParams): string {
  const url = new URL(BASE_URL);
  url.searchParams.set("service", String(params.service));

  const stringable: (keyof JStageQueryParams)[] = [
    "material",
    "article",
    "author",
    "affil",
    "keyword",
    "abst",
    "text",
    "issn",
    "cdjournal",
    "lang",
  ];
  for (const key of stringable) {
    const value = params[key];
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const numerable: (keyof JStageQueryParams)[] = [
    "pubyearfrom",
    "pubyearto",
    "vol",
    "no",
    "start",
    "sortflg",
    "pubtype",
  ];
  for (const key of numerable) {
    const value = params[key];
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const count = Math.min(params.count ?? 20, MAX_COUNT_PER_REQUEST);
  url.searchParams.set("count", String(count));

  return url.toString();
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

/**
 * پاسخ Atom XML رو به شکل ساده‌تری برای مصرف LLM تبدیل می‌کنه.
 * J-STAGE هر رکورد رو داخل تگ <entry> برمی‌گردونه.
 */
function parseAtomResponse(xml: string): JStageResponse {
  const parsed = xmlParser.parse(xml);
  const feed = parsed?.feed ?? {};

  const rawEntries = feed.entry
    ? Array.isArray(feed.entry)
      ? feed.entry
      : [feed.entry]
    : [];

  const entries: JStageEntry[] = rawEntries.map((entry: JStageEntry) => {
    // فیلدهای متنی که توی XML به‌صورت { "#text": "..." } یا مستقیم استرینگ میان رو ساده می‌کنیم
    const flat: JStageEntry = {};
    for (const [key, value] of Object.entries(entry)) {
      if (value && typeof value === "object" && "#text" in value) {
        flat[key] = (value as { "#text": string })["#text"];
      } else {
        flat[key] = value;
      }
    }
    return flat;
  });

  return {
    totalResults: feed["openSearch:totalResults"]
      ? Number(feed["openSearch:totalResults"])
      : undefined,
    startIndex: feed["openSearch:startIndex"]
      ? Number(feed["openSearch:startIndex"])
      : undefined,
    itemsPerPage: feed["openSearch:itemsPerPage"]
      ? Number(feed["openSearch:itemsPerPage"])
      : undefined,
    entries,
  };
}

export class JStageApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "JStageApiError";
  }
}

export async function queryJStage(
  params: JStageQueryParams
): Promise<JStageResponse> {
  await throttle();

  const url = buildUrl(params);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // NCBI/JST هر دو توصیه می‌کنن که User-Agent قابل شناسایی بفرستی
        "User-Agent": "jstage-mcp-server/0.1.0 (contact: set-your-email-here)",
      },
    });
  } catch (err) {
    throw new JStageApiError(
      `درخواست به J-STAGE با خطا مواجه شد: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    throw new JStageApiError(
      `J-STAGE پاسخ غیرموفق برگردوند: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const xml = await response.text();
  return parseAtomResponse(xml);
}
