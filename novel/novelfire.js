const mangayomiSources = [{
    "name": "NovelFire",
    "lang": "en",
    "baseUrl": "https://novelfire.net",
    "apiUrl": "",
    "iconUrl": "https://m.media-amazon.com/images/I/31957gKv8WL.jpg",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.3",
    "pkgPath": "novel/src/en/novelfire.js",
    "notes": "Shows accurate last updated dates for each chapter."
}];
function parseDate(str) {
    if (!str) return null;
    const raw = str.trim();
    if (!raw) return null;
    const isoStr = raw.includes("T") ? raw : raw.replace(" ", "T");
    let ms = Date.parse(isoStr);
    if (!isNaN(ms)) return ms.toString();
    const lower = raw.toLowerCase();
    const relMatch = lower.match(/(\d+)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago/);
    if (relMatch) {
        const val = parseInt(relMatch[1]);
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
    ms = Date.parse(raw);
    if (!isNaN(ms)) return ms.toString();
    return null;
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
        const books = doc.select('ul.novel-list li.novel-item');
        for (const book of books) {
            const bookAnchors = book.select('a');
            if (bookAnchors.length === 0) continue;
            const bookAnchor = bookAnchors[0];
            const bookTitle = bookAnchor.attr("title");
            const bookHref = bookAnchor.attr("href");
            if (!bookHref) continue;
            const bookLink = bookHref.startsWith("http") ? bookHref : `${this.source.baseUrl}${bookHref}`;
            const imgList = book.select('figure.novel-cover img');
            let imageUrl = "";
            if (imgList.length > 0) {
                const imgAttr = imgList[0].attr("data-src") || imgList[0].attr("src");
                imageUrl = imgAttr.startsWith('http') ? imgAttr : `${this.source.baseUrl}${imgAttr}`;
            }
            bookList.push({
                'name': bookTitle,
                'link': bookLink,
                'imageUrl': imageUrl
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
        return { 'list': bookList, 'hasNextPage': hasNextPage };
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
        const baseUrl = this.source.baseUrl;
        const searchUrl = `${baseUrl}/search?keyword=${encodeURIComponent(query)}&type=both&page=${page}`;
        return await this.getBooks(searchUrl);
    }
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
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
        const bookGenres = keywords ? keywords.split(',').map(g => g.trim()).filter(g => g.toLowerCase() !== 'novel' && g.toLowerCase() !== 'webnovel') : [];
        const statusEl = queryFirst(doc, ["div.header-stats span strong"]);
        const statusText = statusEl ? statusEl.text.toLowerCase() : "";
        const status = statusText.includes("ongoing") ? 1 : 0;
        let chaptersUrl = `${url.replace(/\/+$/, "")}/chapters`;
        const chaptersList = [];
        while (chaptersUrl) {
            const chaptersRes = await client.get(chaptersUrl, this.getHeaders(chaptersUrl));
            if (chaptersRes.statusCode !== 200) break;
            const chaptersDoc = new Document(chaptersRes.body);
            const chapterElements = chaptersDoc.select("ul.chapter-list li a");
            for (const element of chapterElements) {
                const titleEl = queryFirst(element, ["strong.chapter-title"]);
                const chapterTitle = titleEl ? titleEl.text.trim() : element.text.trim();
                const numEl = queryFirst(element, ["span.chapter-no"]);
                const chapterNum = numEl ? numEl.text.trim() : "";
                const chapterUrl = chapterNum ? `${url.replace(/\/+$/, "")}/chapter-${chapterNum}` : (element.attr("href") || "");
                let dateUpload = null;
                const timeEls = element.select("time");
                if (timeEls.length > 0) {
                    const dt = timeEls[0].attr("datetime");
                    if (dt) {
                        dateUpload = parseDate(dt);
                    }
                    if (!dateUpload) {
                        dateUpload = parseDate(timeEls[0].text);
                    }
                }
                chaptersList.push({
                    'name': chapterTitle,
                    'url': chapterUrl.startsWith("http") ? chapterUrl : `${this.source.baseUrl}${chapterUrl}`,
                    'dateUpload': dateUpload,
                    'scanlator': ""
                });
            }
            const nextButtons = chaptersDoc.select("ul.pagination li.page-item a[rel='next']");
            if (nextButtons.length > 0) {
                const nextHref = nextButtons[0].attr("href");
                if (nextHref && nextHref !== "#" && nextHref !== chaptersUrl) {
                    chaptersUrl = nextHref.startsWith('http') ? nextHref : `${this.source.baseUrl}${nextHref}`;
                } else {
                    chaptersUrl = null;
                }
            } else {
                chaptersUrl = null;
            }
        }
        return {
            'name': bookTitle,
            'link': url,
            'imageUrl': imgLink.startsWith("http") ? imgLink : `${this.source.baseUrl}${imgLink}`,
            'description': bookDescription,
            'author': bookAuthor,
            'genre': bookGenres,
            'status': status,
            'chapters': chaptersList.reverse()
        };
    }
    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }
        const doc = new Document(res.body);
        const chapterContent = queryFirst(doc, ["div#content", "div.chapter-content"]);
        if (!chapterContent || !chapterContent.text.trim()) {
            throw new Error("Empty chapter content or blocked by protection");
        }
        return chapterContent.outerHtml;
    }
    async cleanHtmlContent(html) {
        const doc = new Document(html);
        const content = queryFirst(doc, ["div#content"]);
        if (!content) return html;
        const paragraphs = content.select("p");
        let cleanedHtml = "";
        for (const p of paragraphs) {
            const pText = p.text;
            if (pText.includes("Translator:") || pText.includes("Editor:")) {
                continue;
            }
            cleanedHtml += p.outerHtml;
        }
        return cleanedHtml;
    }
    getFilterList() {
        return [];
    }
    getSourcePreferences() {
        return [];
    }
}
