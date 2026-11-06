const mangayomiSources = [{
    "name": "Fictionpress",
    "lang": "en",
    "baseUrl": "https://www.fictionpress.com",
    "apiUrl": "",
    "iconUrl": "https://www.fictionpress.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
    "pkgPath": "novel/src/en/fictionpress.js",
    "hasCloudflare": true,
    "notes": "Original fiction and creative writing community by FanFiction.Net"
}];
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.source.baseUrl}/`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }
    async parseStories(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        const doc = new Document(res.body);
        const bookList = [];
        const seen = new Set();
        const cards = doc.select(".z-list");
        for (const card of cards) {
            const a = queryFirst(card, ["a.stitle"]);
            if (!a) continue;
            let href = a.attr("href") || "";
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);
            const title = a.text.trim();
            if (!title) continue;
            const img = queryFirst(card, ["img.cavatar"]);
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("src") || "";
                if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
            }
            bookList.push({
                name: title,
                link: href,
                imageUrl: imageUrl
            });
        }
        const paginationLinks = doc.select("center a, .pagination a");
        const hasNextPage = paginationLinks.some(link => link.text.includes("Next"));
        return { list: bookList, hasNextPage: hasNextPage || bookList.length >= 25 };
    }
    get supportsLatest() {
        return true;
    }
    async getPopular(page) {
        const url = `${this.source.baseUrl}/browse/?&sort=1&p=${page}`;
        return await this.parseStories(url);
    }
    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/browse/?&sort=2&p=${page}`;
        return await this.parseStories(url);
    }
    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/search/?keywords=${encodeURIComponent(query)}&ready=1&type=story&p=${page}`;
        return await this.parseStories(url);
    }
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load story (${res.statusCode})`);
        }
        const doc = new Document(res.body);
        const profileTop = queryFirst(doc, ["#profile_top"]);
        const titleEl = profileTop ? queryFirst(profileTop, ["b.xcontrast_txt"]) : queryFirst(doc, ["b.xcontrast_txt", "h1"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown Title";
        const authorEl = profileTop ? queryFirst(profileTop, ["a.xcontrast_txt[href^='/u/']"]) : queryFirst(doc, ["a[href^='/u/']"]);
        const author = authorEl ? authorEl.text.trim() : "";
        const descEl = profileTop ? queryFirst(profileTop, ["div.xcontrast_txt"]) : queryFirst(doc, ["div.z-indent"]);
        const description = descEl ? descEl.text.trim() : "";
        const imgEl = profileTop ? queryFirst(profileTop, ["img.cavatar"]) : queryFirst(doc, ["img.cavatar"]);
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
        }
        const xmetaEl = profileTop ? queryFirst(profileTop, ["span.xgray"]) : null;
        const xmetaText = xmetaEl ? xmetaEl.text : "";
        const status = xmetaText.toLowerCase().includes("status: complete") ? 1 : 0;
        let dateUpload = null;
        const timeSpans = doc.select("span[data-xutime]");
        if (timeSpans.length > 0) {
            const xu = timeSpans[0].attr("data-xutime");
            if (xu) {
                const ts = parseInt(xu);
                if (!isNaN(ts) && ts > 0) {
                    dateUpload = (ts * 1000).toString();
                }
            }
        }
        const chapters = [];
        const selectElem = queryFirst(doc, ["select#chap_select"]);
        const options = selectElem ? selectElem.select("option") : [];
        const storyMatch = url.match(/\/s\/(\d+)/);
        const storyId = storyMatch ? storyMatch[1] : "";
        const pathParts = url.split("/");
        const slug = pathParts.length > 5 ? pathParts[5] : "";
        if (options.length > 0) {
            for (const opt of options) {
                const chNum = opt.attr("value");
                const chTitle = opt.text.trim();
                const chUrl = `${this.source.baseUrl}/s/${storyId}/${chNum}/${slug}`;
                chapters.push({
                    name: chTitle || `Chapter ${chNum}`,
                    url: chUrl,
                    dateUpload: dateUpload,
                    scanlator: ""
                });
            }
        } else {
            chapters.push({
                name: "Chapter 1",
                url: url,
                dateUpload: dateUpload,
                scanlator: ""
            });
        }
        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: [],
            status,
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
        const content = queryFirst(doc, ["div#storytext", "div.storytext"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }
        const paragraphs = doc.select("#storytext p, .storytext p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }
        throw new Error("Empty story text or Cloudflare challenge required");
    }
    async cleanHtmlContent(html) {
        return html;
    }
    getFilterList() {
        return [];
    }
    getSourcePreferences() {
        return [];
    }
}
