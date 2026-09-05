# jstage-mcp-server

سرور MCP برای جستجوی مقالات و نشریات علمی ژاپنی روی **J-STAGE** (پلتفرم JST — آژانس علم و تکنولوژی ژاپن).

ساختارش از `cyanheads/pubmed-mcp-server` الهام گرفته شده، ولی برای J-STAGE ساده‌سازی شده چون:
- J-STAGE برخلاف NCBI نیاز به API key نداره
- فقط ۳ نوع سرویس داره (جستجوی نشریه، فهرست شماره‌ها، جستجوی مقاله) نه ۱۱ تا
- **فقط متادیتا** برمی‌گردونه، نه متن کامل — برای متن کامل باید از فیلد `link`/`doi` هر نتیجه به سایت ناشر رفت

---

## گام ۰: پیش‌نیازها

- Node.js نسخه ۱۸ یا بالاتر (به‌خاطر `fetch` سراسری)
- npm

## گام ۱: نصب

```bash
git clone <این پوشه رو دانلود کن یا کپی کن>
cd jstage-mcp-server
npm install
```

## گام ۲: کامپایل

```bash
npm run build
```

این کار پوشه‌ی `build/` رو با فایل‌های جاوااسکریپت کامپایل‌شده می‌سازه.

## گام ۳: تست محلی با MCP Inspector

قبل از وصل کردن به Claude، بهتره با ابزار رسمی تست MCP مطمئن بشی سرور درست کار می‌کنه:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

این یه رابط وب محلی باز می‌کنه که می‌تونی ابزارهای `jstage_search_articles`, `jstage_search_journals`, `jstage_list_volumes` رو مستقیم صدا بزنی و پاسخ واقعی J-STAGE رو ببینی — بدون اینکه اصلاً Claude درگیر باشه.

نمونه ورودی برای تست `jstage_search_articles`:
```json
{ "keyword": "人工知能", "count": 5 }
```
(«人工知能» یعنی «هوش مصنوعی» — چون بیشتر محتوای J-STAGE ژاپنیه، جستجوی ژاپنی معمولاً نتیجه‌ی بهتری می‌ده)

## گام ۴: وصل کردن به Claude Desktop (حالت stdio — محلی)

فایل کانفیگ Claude Desktop رو باز کن (معمولاً `claude_desktop_config.json`) و این رو اضافه کن:

```json
{
  "mcpServers": {
    "jstage": {
      "command": "node",
      "args": ["/مسیر/کامل/تا/jstage-mcp-server/build/index.js"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

بعد از ذخیره، Claude Desktop رو ریستارت کن. حالا می‌تونی بگی: «توی J-STAGE مقاله درباره‌ی فلان موضوع پیدا کن».

## گام ۵: وصل کردن به Claude Code

```bash
claude mcp add --transport stdio jstage node /مسیر/کامل/تا/jstage-mcp-server/build/index.js
```

بعد با `/mcp` می‌تونی چک کنی که سرور وصل شده.

## گام ۶: دیپلوی برای دسترسی از راه دور (Claude.ai وب)

برای اینکه Claude.ai (نسخه‌ی وب) هم بتونه بهش وصل بشه، باید سرور HTTP رو روی یه آدرس عمومی اجرا کنی.

### تست HTTP لوکال
```bash
MCP_TRANSPORT_TYPE=http npm run start:http
# سرور روی http://localhost:3011/mcp گوش می‌ده
```

### دیپلوی واقعی
چون این سرور از Express استفاده می‌کنه (نه صرفاً یه API route مثل نمونه Next.js)، ساده‌ترین گزینه‌ها:
- **Docker** روی هر VPS (مثلاً یه `Dockerfile` ساده با `CMD ["node", "build/index.js"]` و `ENV MCP_TRANSPORT_TYPE=http`)
- **Railway / Render / Fly.io** — این‌ها اپ‌های Node.js معمولی رو مستقیم از روی ریپو دیپلوی می‌کنن

بعد از دیپلوی، توی **Claude.ai → Settings → Connectors → Add custom connector** آدرس `https://your-domain.com/mcp` رو بده.

---

## نکات مهم

### ۱. محدودیت نرخ درخواست خودخواسته
چون J-STAGE در «سیاست مرورگری»‌ش دانلود انبوه رو ممنوع کرده، داخل `client.ts` یه throttle دستی (حداقل ۵۰۰ میلی‌ثانیه بین درخواست‌ها) و سقف ۲۰۰ نتیجه در هر درخواست گذاشتم. اگه قراره این سرور رو برای چند کاربر همزمان دیپلوی کنی، این عدد رو دوباره بر اساس ترافیک واقعی تنظیم کن.

### ۲. زبان محتوا
اکثر رکوردهای J-STAGE **ژاپنی‌زبان** هستن. اگه کاربر انگلیسی جستجو کنه، نتیجه‌ی کمی می‌گیره — توی توضیح ابزارها (description) این نکته رو گفتم تا خودِ Claude موقع استفاده از ابزار این رو در نظر بگیره و در صورت لزوم پیشنهاد بده کلیدواژه رو به ژاپنی امتحان کنه.

### ۳. نبود متن کامل
هیچ فیلد full-text ای وجود نداره. اگه بخوای این قابلیت رو هم اضافه کنی، باید یه لایه‌ی اضافه بسازی که از روی DOI برگشتی، به سایت ناشر (یا Unpaywall/CrossRef) درخواست بزنه — دقیقاً همون الگوی زنجیره‌ای (`PMC → Europe PMC → Unpaywall`) که توی `cyanheads/pubmed-mcp-server` دیدیم. من عمداً این بخش رو اضافه نکردم چون هر ناشر ژاپنی ساختار HTML متفاوتی داره و نیاز به scraping سفارشی برای هرکدوم داره — این می‌تونه گام بعدی توسعه‌ی این پروژه باشه.

### ۴. تست نشده در sandbox
کد رو مستقیم بر اساس مستندات رسمی SDK نوشتم، ولی محیطی که توش این کد رو نوشتم دسترسی اینترنت نداشت، پس نتونستم خودم `npm install` و کامپایل واقعی رو اجرا کنم. حتماً قبل از استفاده‌ی جدی، گام‌های ۱ تا ۳ بالا رو خودت لوکال انجام بده تا مطمئن بشی همه‌چیز درست کار می‌کنه.

## ساختار پروژه

```
jstage-mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # نقطه‌ی ورود؛ انتخاب stdio یا HTTP
    ├── server.ts              # ساخت McpServer + ثبت ابزارها
    ├── services/jstage/
    │   └── client.ts          # فراخوانی خام API + پارس XML + throttle
    └── tools/
        ├── searchArticles.ts  # service=3
        ├── searchJournals.ts  # service=1
        └── listVolumes.ts     # service=2
```
