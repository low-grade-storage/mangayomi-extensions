const mangayomiSources = [{
    "name": "Wattpad",
    "lang": "en",
    "baseUrl": "https://www.wattpad.com",
    "apiUrl": "https://www.wattpad.com/api/v3",
    "iconUrl": "https://www.wattpad.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
    "pkgPath": "novel/src/en/wattpad.js",
    "hasCloudflare": false,
    "notes": "Wattpad community novel and fanfiction platform"
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
            "Accept": "application/json, text/html, */*"
        };
    }
    get supportsLatest() {
        return true;
    }
    async getPopular(page) {
        const offset = (Math.max(1, page) - 1) * 20;
        const url = `${this.source.baseUrl}/api/v3/stories?limit=20&offset=${offset}&filter=hot`;
        return await this.fetchStoriesApi(url);
    }
    async getLatestUpdates(page) {
        const offset = (Math.max(1, page) - 1) * 20;
        const url = `${this.source.baseUrl}/api/v3/stories?limit=20&offset=${offset}&filter=new`;
        return await this.fetchStoriesApi(url);
    }
    async search(query, page, filters) {
        const offset = (Math.max(1, page) - 1) * 20;
        const url = `${this.source.baseUrl}/api/v3/stories?query=${encodeURIComponent(query)}&limit=20&offset=${offset}`;
        return await this.fetchStoriesApi(url);
    }
    async fetchStoriesApi(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        try {
            const data = JSON.parse(res.body);
            const stories = data.stories || [];
            const bookList = [];
            for (const s of stories) {
                const title = s.title || "";
                const id = s.id || "";
                if (!title || !id) continue;
                const link = s.url || `${this.source.baseUrl}/story/${id}`;
                const imageUrl = s.cover || "";
                bookList.push({
                    name: title,
                    link: link,
                    imageUrl: imageUrl
                });
            }
            return { list: bookList, hasNextPage: stories.length >= 20 };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }
    async getDetail(url) {
        const client = new Client();
        const storyIdMatch = url.match(/\/story\/(\d+)/) || url.match(/\/(\d+)/);
        const storyId = storyIdMatch ? storyIdMatch[1] : "";
        if (storyId) {
            try {
                const apiUrl = `${this.source.baseUrl}/api/v3/stories/${storyId}`;
                const res = await client.get(apiUrl, this.getHeaders(apiUrl));
                if (res.statusCode === 200) {
                    const data = JSON.parse(res.body);
                    const name = data.title || "Unknown Title";
                    const imageUrl = data.cover || "";
                    const description = data.description || "";
                    const author = data.user ? (data.user.name || data.user.username || "") : "";
                    const genres = Array.isArray(data.tags) ? data.tags : [];
                    const status = data.completed ? 1 : 0;
                    const chapters = [];
                    const parts = data.parts || [];
                    for (const p of parts) {
                        const partId = p.id;
                        const partTitle = p.title || `Part ${chapters.length + 1}`;
                        const partUrl = `https://www.wattpad.com/apiv2/storytext?id=${partId}`;
                        let dateUpload = null;
                        if (p.modifyDate || p.createDate) {
                            const ms = Date.parse(p.modifyDate || p.createDate);
                            if (!isNaN(ms)) dateUpload = ms.toString();
                        }
                        chapters.push({
                            name: partTitle,
                            url: partUrl,
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
                        genre: genres,
                        status,
                        chapters
                    };
                }
            } catch (_) {}
        }
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load novel details (${res.statusCode})`);
        }
        const doc = new Document(res.body);
        const titleElem = queryFirst(doc, ["div.story-info h1", "h1.story-info__title", "h1"]);
        const name = titleElem ? titleElem.text.trim() : "Unknown Title";
        const coverElem = queryFirst(doc, ["div.story-info img", ".story-cover img", "figure.cover img"]);
        let imageUrl = "";
        if (coverElem) {
            imageUrl = coverElem.attr("data-src") || coverElem.attr("src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
        }
        const descElem = queryFirst(doc, ["pre.story-description", "h2.description", ".story-info .description"]);
        const description = descElem ? descElem.text.trim() : "";
        const authorElem = queryFirst(doc, ["a.author-info__username", ".story-info .author a", "span.author"]);
        const author = authorElem ? authorElem.text.trim() : "";
        const genres = [];
        const tagElems = doc.select(".tag-item a, .tag-items a, ul.tags li a");
        for (const tag of tagElems) {
            const t = tag.text.trim();
            if (t && !genres.includes(t)) genres.push(t);
        }
        const statsElem = queryFirst(doc, [".story-stats", ".story-badges"]);
        const statsText = statsElem ? statsElem.text.toLowerCase() : "";
        const status = statsText.includes("complete") ? 1 : 0;
        const chapters = [];
        const partElements = doc.select(".story-parts ul li a, .table-of-contents ul li a, ul.story-parts li a");
        for (const part of partElements) {
            const titleSpan = part.selectFirst(".part-title") || part;
            const partTitle = (titleSpan ? titleSpan.text : "").trim();
            let partHref = part.attr("href") || "";
            if (!partHref || partHref === "#") continue;
            const partIdMatch = partHref.match(/\/(\d+)/);
            const partId = partIdMatch ? partIdMatch[1] : "";
            const chUrl = partId ? `https://www.wattpad.com/apiv2/storytext?id=${partId}` : (partHref.startsWith("http") ? partHref : `${this.source.baseUrl}${partHref}`);
            let dateUpload = null;
            const timeElem = part.selectFirst("time") || part.selectFirst("span.date");
            if (timeElem) {
                const dt = timeElem.attr("datetime");
                if (dt) {
                    const ms = Date.parse(dt.includes("T") ? dt : dt.replace(" ", "T"));
                    if (!isNaN(ms)) dateUpload = ms.toString();
                }
            }
            chapters.push({
                name: partTitle || `Part ${chapters.length + 1}`,
                url: chUrl,
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
            genre: genres,
            status,
            chapters
        };
    }
    async getHtmlContent(name, url) {
        const client = new Client();
        let targetUrl = url;
        const partIdMatch = url.match(/id=(\d+)/) || url.match(/\/(\d+)/);
        if (partIdMatch && !url.includes("apiv2/storytext")) {
            targetUrl = `https://www.wattpad.com/apiv2/storytext?id=${partIdMatch[1]}`;
        }
        const res = await client.get(targetUrl, this.getHeaders(targetUrl));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }
        if (targetUrl.includes("apiv2/storytext") && res.body && res.body.trim()) {
            return res.body;
        }
        const doc = new Document(res.body);
        const paragraphs = doc.select("p[data-p-id], .panel-reading p, .story-text p, pre");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }
        const contentElem = doc.selectFirst(".panel-reading") || doc.selectFirst(".story-text") || doc.selectFirst("article");
        if (contentElem && contentElem.text.trim()) {
            return contentElem.outerHtml;
        }
        throw new Error("Empty chapter content");
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
