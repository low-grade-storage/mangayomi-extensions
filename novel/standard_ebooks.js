const mangayomiSources = [{
    "name": "Standard E-Books",
    "lang": "en",
    "baseUrl": "https://standardebooks.org",
    "apiUrl": "",
    "iconUrl": "https://standardebooks.org/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/standard_ebooks.js",
    "hasCloudflare": false,
    "notes": "Free and liberated ebooks, carefully produced for the true book lover"
}];

function queryFirst(parent, selectors) {
    for (const sel of selectors) {
        const list = parent.select(sel);
        if (list && list.length > 0) return list[0];
    }
    return null;
}

function parseDateMs(str) {
    if (!str) return null;
    const s = str.trim();
    if (!s) return null;

    let ms = Date.parse(s);
    if (!isNaN(ms)) return ms.toString();

    const yMatch = s.match(/\b(18\d\d|19\d\d|20\d\d)\b/);
    if (yMatch) {
        ms = Date.parse(`${yMatch[1]}-01-01`);
        if (!isNaN(ms)) return ms.toString();
    }
    return null;
}

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.source.baseUrl}/`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }

    async parseBooks(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        const doc = new Document(res.body);
        const bookList = [];
        const seen = new Set();

        const items = doc.select("ol li, article.ebook, li.ebook");
        for (const item of items) {
            const a = queryFirst(item, ["a[href^='/ebooks/']"]);
            if (!a) continue;

            let href = a.attr("href") || "";
            if (!href || href === "/ebooks" || href === "/ebooks/") continue;
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);

            const titleElem = queryFirst(item, ["span[property='schema:name']", ".title", "p.title"]) || a;
            const title = (titleElem ? titleElem.text : "").trim();
            if (!title) continue;

            const img = queryFirst(item, ["img"]);
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("src") || img.attr("data-src") || "";
                if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
                else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
            }

            bookList.push({
                name: title,
                link: href,
                imageUrl: imageUrl
            });
        }

        const paginationLinks = doc.select("a[rel='next'], a");
        const hasNextPage = paginationLinks.some(l => l.text.toLowerCase().includes("next") || l.attr("rel") === "next");
        return { list: bookList, hasNextPage: hasNextPage || bookList.length >= 24 };
    }

    get supportsLatest() {
        return true;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/ebooks?page=${page}&sort=popular`;
        return await this.parseBooks(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/ebooks?page=${page}&sort=newest`;
        return await this.parseBooks(url);
    }

    async search(query, page, filters) {
        let sortVal = "popular";
        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter" && f.name === "Sort By" && f.values && f.values[f.state]) {
                    sortVal = f.values[f.state].value;
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/ebooks?query=${encodeURIComponent(query.trim())}&page=${page}&sort=${sortVal}`;
            return await this.parseBooks(url);
        }

        const url = `${this.source.baseUrl}/ebooks?page=${page}&sort=${sortVal}`;
        return await this.parseBooks(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load ebook details (${res.statusCode})`);
        }
        const html = res.body;
        const doc = new Document(html);

        const titleElem = queryFirst(doc, ["h1"]);
        const name = titleElem ? titleElem.text.trim() : "Unknown Title";

        const authorElem = queryFirst(doc, ["p.author", "a.author", "p[property='schema:author']"]);
        const author = authorElem ? authorElem.text.trim() : "";

        const descElem = queryFirst(doc, ["section#description", "div.description", "article#content"]);
        const description = descElem ? descElem.text.trim() : "";

        const imgElem = queryFirst(doc, ["img.cover", "figure img", "picture img"]);
        let imageUrl = "";
        if (imgElem) {
            imageUrl = imgElem.attr("src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
            else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
        }

        const genres = [];
        const genreElems = doc.select("a[href*='/subject/'], a[href*='/collection/']");
        for (const g of genreElems) {
            const gt = g.text.trim();
            if (gt && !genres.includes(gt)) genres.push(gt);
        }

        // Extract reliable publication / modification timestamp
        let dateUpload = "1431388800000"; // default 2015-05-12
        const dateMeta = queryFirst(doc, ["meta[property*='dateModified']", "meta[property*='datePublished']"]);
        if (dateMeta && dateMeta.attr("content")) {
            const parsed = parseDateMs(dateMeta.attr("content"));
            if (parsed) dateUpload = parsed;
        } else {
            const timeEl = queryFirst(doc, ["time"]);
            if (timeEl && (timeEl.attr("datetime") || timeEl.text)) {
                const parsed = parseDateMs(timeEl.attr("datetime") || timeEl.text);
                if (parsed) dateUpload = parsed;
            }
        }

        // Fetch Table of Contents from /text page
        const chapters = [];
        const tocUrl = `${url.replace(/\/+$/, "")}/text`;
        const tocRes = await client.get(tocUrl, this.getHeaders(tocUrl));
        if (tocRes.statusCode === 200) {
            const tocDoc = new Document(tocRes.body);
            const chapterLinks = tocDoc.select("nav ol li a, section ol li a, ol li a");
            const seen = new Set();
            let chNum = 0;

            for (const a of chapterLinks) {
                let href = a.attr("href") || "";
                if (!href || href.startsWith("#")) continue;
                if (!href.startsWith("http")) {
                    href = href.startsWith("/") ? `${this.source.baseUrl}${href}` : `${tocUrl}/${href.replace(/^text\//, "")}`;
                }
                if (seen.has(href)) continue;
                seen.add(href);

                const rawTitle = a.text.trim();
                if (!rawTitle) continue;
                chNum++;

                let chName = rawTitle;
                if (/^\d+$/.test(rawTitle)) {
                    chName = `Chapter ${rawTitle}`;
                }

                chapters.push({
                    name: chName,
                    url: href,
                    dateUpload: dateUpload,
                    scanlator: author || "Standard Ebooks"
                });
            }
        }

        if (chapters.length === 0) {
            chapters.push({
                name: "Complete Book (Single Page)",
                url: `${url.replace(/\/+$/, "")}/text/single-page`,
                dateUpload: dateUpload,
                scanlator: author || "Standard Ebooks"
            });
        }

        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: genres,
            status: 1, // Public domain editions are completed
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const content = queryFirst(doc, ["article", "section", "main"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }

        const paragraphs = doc.select("p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }

        throw new Error("Empty chapter content");
    }

    async cleanHtmlContent(html) {
        return html;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Popular", value: "popular" },
                    { type_name: "SelectOption", name: "Newest", value: "newest" },
                    { type_name: "SelectOption", name: "Author", value: "author" },
                    { type_name: "SelectOption", name: "Title", value: "title" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
