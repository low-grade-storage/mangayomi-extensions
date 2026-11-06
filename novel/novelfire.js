const mangayomiSources = [{
    "name": "NovelFire",
    "lang": "en",
    "baseUrl": "https://novelfire.net",
    "apiUrl": "",
    "iconUrl": "https://m.media-amazon.com/images/I/31957gKv8WL.jpg",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.5",
    "pkgPath": "novel/src/en/novelfire.js",
    "notes": "Shows accurate last updated dates for each chapter."
}];

function parseDate(str) {
    if (!str) return null;
    const raw = str.trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const relMatch = lower.match(/(\d+)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago/);
    if (relMatch) {
        const val = parseInt(relMatch[1], 10);
        const unit = relMatch[2];
        let mult = 1000;
        if (unit.startsWith("sec")) mult = 1000;
        else if (unit.startsWith("min")) mult = 60 * 1000;
        else if (unit.startsWith("hour") || unit.startsWith("hr")) mult = 3600 * 1000;
        else if (unit.startsWith("day")) mult = 86400 * 1000;
        else if (unit.startsWith("week")) mult = 7 * 86400 * 1000;
        else if (unit.startsWith("month")) mult = 30 * 86400 * 1000;
        else if (unit.startsWith("year")) mult = 365 * 86400 * 1000;
        return (Date.now() - val * mult).toString();
    }

    const isoStr = raw.includes("T") ? raw : raw.replace(" ", "T");
    let ms = Date.parse(isoStr);
    if (!isNaN(ms)) return ms.toString();

    ms = Date.parse(raw);
    if (!isNaN(ms)) return ms.toString();

    return null;
}

function decodeEntities(str) {
    if (!str) return "";
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&rsquo;/g, "’")
        .replace(/&lsquo;/g, "‘")
        .replace(/&ldquo;/g, "“")
        .replace(/&rdquo;/g, "”")
        .replace(/&nbsp;/g, " ");
}

function parseChaptersFromHtml(html, baseUrl) {
    const list = [];
    const ulMatch = html.match(/<ul[^>]*class=["'][^"']*chapter-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
    const content = ulMatch ? ulMatch[1] : html;

    const liRegex = /<li[^>]*>[\s\S]*?<a\s+([^>]*?)>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
    let match;
    while ((match = liRegex.exec(content)) !== null) {
        const aAttrs = match[1];
        const inner = match[2];

        const hrefMatch = aAttrs.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) continue;
        const rawHref = hrefMatch[1].trim();
        if (!rawHref || rawHref === "#") continue;
        const chUrl = rawHref.startsWith("http")
            ? rawHref
            : `${baseUrl}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;

        let title = "";
        const tMatch = inner.match(/<strong[^>]*class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i);
        if (tMatch) {
            title = decodeEntities(tMatch[1].replace(/<[^>]+>/g, "").trim());
        }
        if (!title) {
            const attrTitleMatch = aAttrs.match(/title=["']([^"']+)["']/i);
            if (attrTitleMatch) title = decodeEntities(attrTitleMatch[1].trim());
        }
        if (!title) {
            title = decodeEntities(inner.replace(/<[^>]+>/g, "").trim());
        }

        const cnoMatch = inner.match(/<span[^>]*class=["'][^"']*chapter-no[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        let cno = cnoMatch ? cnoMatch[1].trim() : "";
        if (!cno) {
            const numInHref = chUrl.match(/\/chapter-([^\/?#]+)/i);
            if (numInHref) cno = numInHref[1];
        }

        let dateUpload = null;
        const timeMatch = inner.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>([\s\S]*?)<\/time>/i);
        if (timeMatch) {
            dateUpload = parseDate(timeMatch[1]) || parseDate(timeMatch[2]);
        }
        if (!dateUpload) {
            const timeTagMatch = inner.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
            if (timeTagMatch) {
                dateUpload = parseDate(timeTagMatch[1]);
            }
        }

        list.push({
            name: title || (cno ? `Chapter ${cno}` : "Chapter"),
            url: chUrl,
            dateUpload: dateUpload,
            scanlator: cno ? `NovelFire #${cno}` : `NovelFire #${list.length + 1}`
        });
    }
    return list;
}

function queryFirst(parent, selectors) {
    for (const sel of selectors) {
        const list = parent.select(sel);
        if (list && list.length > 0) return list[0];
    }
    return null;
}

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        };
    }

    async getBooks(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        const doc = new Document(res.body);

        const bookList = [];
        const books = doc.select("ul.novel-list li.novel-item");
        for (const book of books) {
            const bookAnchors = book.select("a");
            if (bookAnchors.length === 0) continue;
            const bookAnchor = bookAnchors[0];
            const bookTitle = bookAnchor.attr("title") || bookAnchor.text.trim();
            const bookHref = bookAnchor.attr("href");
            if (!bookHref) continue;
            const bookLink = bookHref.startsWith("http") ? bookHref : `${this.source.baseUrl}${bookHref}`;

            const imgList = book.select("figure.novel-cover img");
            let imageUrl = "";
            if (imgList.length > 0) {
                const imgAttr = imgList[0].attr("data-src") || imgList[0].attr("src");
                imageUrl = imgAttr.startsWith("http") ? imgAttr : `${this.source.baseUrl}${imgAttr}`;
            }

            bookList.push({
                name: bookTitle,
                link: bookLink,
                imageUrl: imageUrl
            });
        }

        const nextButtons = doc.select("ul.pagination li.page-item:last-child a");
        let hasNextPage = false;
        if (nextButtons.length > 0) {
            const nextHref = nextButtons[0].attr("href");
            if (nextHref && nextHref !== "#" && nextHref !== url) {
                hasNextPage = true;
            }
        }

        return { list: bookList, hasNextPage: hasNextPage };
    }

    async getPopular(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/genre-all/sort-popular/status-all/all-novel?page=${page}`;
        return await this.getBooks(url);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/latest-release-novels?page=${page}`;
        return await this.getBooks(url);
    }

    async search(query, page, filters) {
        let genreVal = "all";
        let sortVal = "popular";
        let statusVal = "all";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Genre" && f.values && f.values[f.state]) {
                        genreVal = f.values[f.state].value;
                    } else if (f.name === "Sort By" && f.values && f.values[f.state]) {
                        sortVal = f.values[f.state].value;
                    } else if (f.name === "Status" && f.values && f.values[f.state]) {
                        statusVal = f.values[f.state].value;
                    }
                }
            }
        }

        if (query && query.trim()) {
            const searchUrl = `${this.source.baseUrl}/search?keyword=${encodeURIComponent(query.trim())}&type=both&page=${page}`;
            return await this.getBooks(searchUrl);
        }

        const url = `${this.source.baseUrl}/genre-${genreVal}/sort-${sortVal}/status-${statusVal}/all-novel?page=${page}`;
        return await this.getBooks(url);
    }

    async getDetail(url) {
        const client = new Client();
        const baseUrl = this.source.baseUrl || "https://novelfire.net";
        const cleanUrl = url
            .replace(/\/+$/, "")
            .replace(/\/chapter-[^\/]+$/, "")
            .replace(/\/chapters$/, "");

        const res = await client.get(cleanUrl, this.getHeaders(cleanUrl));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load novel details (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const titleEl = queryFirst(doc, ["div.main-head h1.novel-title", "h1.novel-title", "h1"]);
        const bookTitle = titleEl ? titleEl.text.trim() : "Unknown Title";

        const coverEl = queryFirst(doc, ["figure.cover img", "div.novel-cover img"]);
        const imgLink = coverEl ? (coverEl.attr("data-src") || coverEl.attr("src") || "") : "";

        const descMeta = queryFirst(doc, ['meta[itemprop="description"]']);
        const bookDescription = descMeta ? descMeta.attr("content") : "";

        const authorEl = queryFirst(doc, ['span[itemprop="author"]', 'div.author span']);
        const bookAuthor = authorEl ? authorEl.text.trim() : "";

        const kwMeta = queryFirst(doc, ['meta[itemprop="keywords"]']);
        const keywords = kwMeta ? kwMeta.attr("content") : "";
        const bookGenres = keywords ? keywords.split(",").map(g => g.trim()).filter(g => g.toLowerCase() !== "novel" && g.toLowerCase() !== "webnovel") : [];

        const statusEl = queryFirst(doc, ["div.header-stats span strong"]);
        const statusText = statusEl ? statusEl.text.toLowerCase() : "";
        const status = statusText.includes("ongoing") ? 0 : 1;

        const page1Url = `${cleanUrl}/chapters`;
        const page1Res = await client.get(page1Url, this.getHeaders(page1Url));
        if (page1Res.statusCode !== 200) {
            throw new Error(`Failed to load novel chapters (${page1Res.statusCode})`);
        }

        const page1Html = page1Res.body;
        const chaptersList = parseChaptersFromHtml(page1Html, baseUrl);

        let totalPages = 1;
        const statMatch = page1Html.match(/(\d+)\s*Chapters/i);
        if (statMatch) {
            totalPages = Math.max(totalPages, Math.ceil(parseInt(statMatch[1], 10) / 100));
        }
        const inputMatch = page1Html.match(/id=["']gotochapno["'][^>]*max=["'](\d+)["']/i);
        if (inputMatch) {
            totalPages = Math.max(totalPages, Math.ceil(parseInt(inputMatch[1], 10) / 100));
        }
        const pageNums = Array.from(page1Html.matchAll(/[?&]page=(\d+)/g)).map(m => parseInt(m[1], 10));
        if (pageNums.length > 0) {
            totalPages = Math.max(totalPages, Math.max(...pageNums));
        }

        if (totalPages > 1) {
            const pagesToFetch = [];
            for (let p = 2; p <= totalPages; p++) {
                pagesToFetch.push(p);
            }

            const BATCH_SIZE = 6;
            for (let i = 0; i < pagesToFetch.length; i += BATCH_SIZE) {
                const batch = pagesToFetch.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batch.map(async (p) => {
                        const pUrl = `${cleanUrl}/chapters?page=${p}`;
                        const r = await client.get(pUrl, this.getHeaders(pUrl));
                        if (r.statusCode === 200) {
                            return parseChaptersFromHtml(r.body, baseUrl);
                        }
                        return [];
                    })
                );
                for (const chList of batchResults) {
                    for (const ch of chList) {
                        chaptersList.push(ch);
                    }
                }
            }
        }

        return {
            name: bookTitle,
            link: cleanUrl,
            imageUrl: imgLink.startsWith("http") ? imgLink : `${baseUrl}${imgLink}`,
            description: bookDescription,
            author: bookAuthor,
            genre: bookGenres,
            status: status,
            chapters: chaptersList.reverse()
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        let targetUrl = url;
        const res = await client.get(targetUrl, this.getHeaders(targetUrl));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }

        let body = res.body;

        // Follow client-side JS redirects (e.g. readnovel.site -> novelphoenix.com)
        const redirMatch = body.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
        if (redirMatch) {
            const redirUrl = redirMatch[1].replace(/\\\//g, "/");
            const redirRes = await client.get(redirUrl, this.getHeaders(redirUrl));
            if (redirRes.statusCode === 200) {
                body = redirRes.body;
            }
        }

        const doc = new Document(body);
        const chapterContent = queryFirst(doc, ["div#content", "div.chapter-content", "article"]);
        if (chapterContent && chapterContent.text.trim()) {
            return chapterContent.outerHtml;
        }

        const paragraphs = doc.select("#content p, .chapter-content p, article p, p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }

        throw new Error("Empty chapter content or blocked by protection");
    }

    async cleanHtmlContent(html) {
        if (!html) return "";
        const doc = new Document(html);
        const content = queryFirst(doc, ["div#content", "div.chapter-content", "article"]);
        if (!content) return html;

        const paragraphs = content.select("p");
        if (!paragraphs || paragraphs.length === 0) return content.outerHtml;
        let cleanedHtml = "";
        for (const p of paragraphs) {
            const pText = p.text;
            if (pText.includes("Translator:") || pText.includes("Editor:")) {
                continue;
            }
            cleanedHtml += p.outerHtml;
        }
        return cleanedHtml || content.outerHtml;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Popular", value: "popular" },
                    { type_name: "SelectOption", name: "Latest Updates", value: "latest" },
                    { type_name: "SelectOption", name: "Rating", value: "rating" },
                    { type_name: "SelectOption", name: "Most Bookmarked", value: "bookmark" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "all" },
                    { type_name: "SelectOption", name: "Ongoing", value: "ongoing" },
                    { type_name: "SelectOption", name: "Completed", value: "completed" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Genres", value: "all" },
                    { type_name: "SelectOption", name: "Action", value: "action" },
                    { type_name: "SelectOption", name: "Adventure", value: "adventure" },
                    { type_name: "SelectOption", name: "Comedy", value: "comedy" },
                    { type_name: "SelectOption", name: "Fantasy", value: "fantasy" },
                    { type_name: "SelectOption", name: "Horror", value: "horror" },
                    { type_name: "SelectOption", name: "Mystery", value: "mystery" },
                    { type_name: "SelectOption", name: "Romance", value: "romance" },
                    { type_name: "SelectOption", name: "Sci-fi", value: "sci-fi" },
                    { type_name: "SelectOption", name: "Xuanhuan", value: "xuanhuan" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
