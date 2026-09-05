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
async function throttle() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_DELAY_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_DELAY_MS - elapsed));
    }
    lastRequestTime = Date.now();
}
function buildUrl(params) {
    const url = new URL(BASE_URL);
    url.searchParams.set("service", String(params.service));
    const stringable = [
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
    const numerable = [
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
function parseAtomResponse(xml) {
    const parsed = xmlParser.parse(xml);
    const feed = parsed?.feed ?? {};
    const rawEntries = feed.entry
        ? Array.isArray(feed.entry)
            ? feed.entry
            : [feed.entry]
        : [];
    const entries = rawEntries.map((entry) => {
        // فیلدهای متنی که توی XML به‌صورت { "#text": "..." } یا مستقیم استرینگ میان رو ساده می‌کنیم
        const flat = {};
        for (const [key, value] of Object.entries(entry)) {
            if (value && typeof value === "object" && "#text" in value) {
                flat[key] = value["#text"];
            }
            else {
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
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = "JStageApiError";
    }
}
export async function queryJStage(params) {
    await throttle();
    const url = buildUrl(params);
    let response;
    try {
        response = await fetch(url, {
            headers: {
                // NCBI/JST هر دو توصیه می‌کنن که User-Agent قابل شناسایی بفرستی
                "User-Agent": "jstage-mcp-server/0.1.0 (contact: set-your-email-here)",
            },
        });
    }
    catch (err) {
        throw new JStageApiError(`درخواست به J-STAGE با خطا مواجه شد: ${err.message}`);
    }
    if (!response.ok) {
        throw new JStageApiError(`J-STAGE پاسخ غیرموفق برگردوند: ${response.status} ${response.statusText}`, response.status);
    }
    const xml = await response.text();
    return parseAtomResponse(xml);
}
