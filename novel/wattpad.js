const mangayomiSources = [{
    "name": "Wattpad",
    "lang": "en",
    "baseUrl": "https://www.wattpad.com",
    "apiUrl": "https://api.wattpad.com",
    "iconUrl": "https://www.wattpad.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/wattpad.js",
    "hasCloudflare": false,
    "notes": "Wattpad community novel and fanfiction platform powered by unblocked Wattpad API"
}];

function queryFirst(parent, selectors) {
    for (const sel of selectors) {
        const list = parent.select(sel);
        if (list && list.length > 0) return list[0];
    }
    return null;
}

class DefaultExtension extends MProvider {
    get apiBase() {
        return "https://api.wattpad.com";
    }

    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.wattpad.com/",
            "Accept": "application/json, text/html, */*"
        };
    }

    get supportsLatest() {
        return true;
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

                const link = `${this.source.baseUrl}/story/${id}`;
                const imageUrl = s.cover || "";

                bookList.push({
                    name: title,
                    link: link,
                    imageUrl: imageUrl
                });
            }

            const total = typeof data.total === "number" ? data.total : stories.length;
            return { list: bookList, hasNextPage: stories.length >= 20 };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        const offset = (Math.max(1, page) - 1) * 20;
        const url = `${this.apiBase}/api/v3/stories?limit=20&offset=${offset}&filter=hot`;
        return await this.fetchStoriesApi(url);
    }

    async getLatestUpdates(page) {
        const offset = (Math.max(1, page) - 1) * 20;
        const url = `${this.apiBase}/api/v3/stories?limit=20&offset=${offset}&filter=new`;
        return await this.fetchStoriesApi(url);
    }

    async search(query, page, filters) {
        const offset = (Math.max(1, page) - 1) * 20;
        let filterVal = "hot";
        let categoryVal = "";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Sort By" && f.values && f.values[f.state]) {
                        filterVal = f.values[f.state].value;
                    } else if (f.name === "Category" && f.values && f.values[f.state]) {
                        categoryVal = f.values[f.state].value;
                    }
                }
            }
        }

        let url = `${this.apiBase}/api/v3/stories?limit=20&offset=${offset}`;
        if (query && query.trim()) {
            url += `&query=${encodeURIComponent(query.trim())}`;
            if (filterVal) url += `&filter=${filterVal}`;
        } else {
            if (categoryVal) url += `&category=${categoryVal}`;
            if (filterVal) url += `&filter=${filterVal}`;
        }

        return await this.fetchStoriesApi(url);
    }

    async getDetail(url) {
        const client = new Client();
        const storyIdMatch = url.match(/\/story\/(\d+)/) || url.match(/\/(\d+)/);
        const storyId = storyIdMatch ? storyIdMatch[1] : "";

        if (storyId) {
            try {
                const apiUrl = `${this.apiBase}/api/v3/stories/${storyId}`;
                const res = await client.get(apiUrl, this.getHeaders(apiUrl));
                if (res.statusCode === 200) {
                    const data = JSON.parse(res.body);
                    const name = data.title || "Unknown Title";
                    const imageUrl = data.cover || "";
                    const description = data.description || "";
                    const author = data.user ? (data.user.name || data.user.fullname || data.user.username || "") : "";
                    const genres = Array.isArray(data.tags) ? data.tags : [];
                    const status = data.completed ? 1 : 0;

                    const chapters = [];
                    const parts = data.parts || [];
                    for (let i = 0; i < parts.length; i++) {
                        const p = parts[i];
                        const partId = p.id;
                        const partTitle = p.title ? p.title.trim() : `Part ${i + 1}`;
                        const partUrl = `${this.apiBase}/apiv2/storytext?id=${partId}`;
                        
                        let dateUpload = null;
                        if (p.modifyDate || p.createDate) {
                            const ms = Date.parse(p.modifyDate || p.createDate);
                            if (!isNaN(ms)) dateUpload = ms.toString();
                        }
                        if (!dateUpload) {
                            dateUpload = "1680000000000";
                        }

                        chapters.push({
                            name: `Part ${i + 1}: ${partTitle}`,
                            url: partUrl,
                            dateUpload: dateUpload,
                            scanlator: author || "Wattpad"
                        });
                    }

                    return {
                        name,
                        link: `${this.source.baseUrl}/story/${storyId}`,
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

        // Web scraping fallback if API direct lookup failed
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
        let partIdx = 0;
        for (const part of partElements) {
            partIdx++;
            const titleSpan = part.selectFirst(".part-title") || part;
            const partTitle = (titleSpan ? titleSpan.text : "").trim();
            let partHref = part.attr("href") || "";
            if (!partHref || partHref === "#") continue;

            const partIdMatch = partHref.match(/\/(\d+)/);
            const partId = partIdMatch ? partIdMatch[1] : "";
            const chUrl = partId ? `${this.apiBase}/apiv2/storytext?id=${partId}` : (partHref.startsWith("http") ? partHref : `${this.source.baseUrl}${partHref}`);

            let dateUpload = null;
            const timeElem = part.selectFirst("time") || part.selectFirst("span.date");
            if (timeElem) {
                const dt = timeElem.attr("datetime");
                if (dt) {
                    const ms = Date.parse(dt.includes("T") ? dt : dt.replace(" ", "T"));
                    if (!isNaN(ms)) dateUpload = ms.toString();
                }
            }
            if (!dateUpload) dateUpload = "1680000000000";

            chapters.push({
                name: `Part ${partIdx}: ${partTitle || ('Part ' + partIdx)}`,
                url: chUrl,
                dateUpload: dateUpload,
                scanlator: author || "Wattpad"
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
            targetUrl = `${this.apiBase}/apiv2/storytext?id=${partIdMatch[1]}`;
        }

        const res = await client.get(targetUrl, this.getHeaders(targetUrl));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }

        if (res.body && res.body.trim()) {
            if (res.body.includes("<p")) {
                return res.body;
            }
            // Plain text story reader
            const lines = res.body.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length > 0) {
                return lines.map(l => `<p>${l.trim()}</p>`).join("\n");
            }
            return `<p>${res.body.trim()}</p>`;
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
                    { type_name: "SelectOption", name: "Hot", value: "hot" },
                    { type_name: "SelectOption", name: "New", value: "new" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Categories", value: "" },
                    { type_name: "SelectOption", name: "Romance", value: "1" },
                    { type_name: "SelectOption", name: "Fantasy", value: "3" },
                    { type_name: "SelectOption", name: "Science Fiction", value: "14" },
                    { type_name: "SelectOption", name: "Mystery", value: "8" },
                    { type_name: "SelectOption", name: "Thriller", value: "17" },
                    { type_name: "SelectOption", name: "Fanfiction", value: "11" },
                    { type_name: "SelectOption", name: "Adventure", value: "2" },
                    { type_name: "SelectOption", name: "Action", value: "21" },
                    { type_name: "SelectOption", name: "Horror", value: "6" },
                    { type_name: "SelectOption", name: "Paranormal", value: "9" },
                    { type_name: "SelectOption", name: "Humor", value: "7" },
                    { type_name: "SelectOption", name: "Teen Fiction", value: "18" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
