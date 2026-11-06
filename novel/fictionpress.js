const mangayomiSources = [{
    "name": "Fictionpress",
    "lang": "en",
    "baseUrl": "https://www.fictionpress.com",
    "apiUrl": "",
    "iconUrl": "https://www.fictionpress.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
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
            "Referer": `${this.source.baseUrl}/`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }

    async parseStories(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 403 || res.statusCode === 503) {
            throw new Error(`Cloudflare protection active (${res.statusCode}). Please open WebView to solve challenge.`);
        }
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
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);

            const title = a.text.trim();
            if (!title) continue;

            const img = queryFirst(card, ["img.cavatar"]);
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("src") || "";
                if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
                else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
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
        let sortVal = "1";
        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter" && f.name === "Sort By" && f.values && f.values[f.state]) {
                    sortVal = f.values[f.state].value;
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/search/?keywords=${encodeURIComponent(query.trim())}&ready=1&type=story&sort=${sortVal}&p=${page}`;
            return await this.parseStories(url);
        }

        const url = `${this.source.baseUrl}/browse/?&sort=${sortVal}&p=${page}`;
        return await this.parseStories(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 403 || res.statusCode === 503) {
            throw new Error(`Cloudflare protection active (${res.statusCode}). Please open WebView to solve challenge.`);
        }
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
            else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
        }

        const xmetaEl = profileTop ? queryFirst(profileTop, ["span.xgray"]) : null;
        const xmetaText = xmetaEl ? xmetaEl.text : "";
        const status = xmetaText.toLowerCase().includes("status: complete") ? 1 : 0;

        // Extract genres from xgray text (e.g. FictionPress lists "Rated: T - English - Fantasy/Romance - Chapters: ...")
        const genres = [];
        const metaParts = xmetaText.split("-").map(p => p.trim());
        for (const p of metaParts) {
            if (p.includes("/") && !p.includes(":") && !p.includes("Updated")) {
                const subGenres = p.split("/").map(s => s.trim());
                for (const sg of subGenres) {
                    if (sg && !genres.includes(sg)) genres.push(sg);
                }
            }
        }

        // Extract last updated date
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
        if (!dateUpload) dateUpload = "1680000000000";

        const chapters = [];
        const selectElem = queryFirst(doc, ["select#chap_select"]);
        const options = selectElem ? selectElem.select("option") : [];

        const storyMatch = url.match(/\/s\/(\d+)/);
        const storyId = storyMatch ? storyMatch[1] : "";
        const pathParts = url.split("/");
        const slug = pathParts.length > 5 ? pathParts[5] : "";

        if (options.length > 0) {
            for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                const chNum = opt.attr("value") || String(i + 1);
                const rawChTitle = opt.text.trim();
                let cleanTitle = rawChTitle;
                if (/^\d+\.\s*/.test(cleanTitle)) {
                    cleanTitle = cleanTitle.replace(/^\d+\.\s*/, "");
                }
                const chTitle = `Chapter ${chNum}: ${cleanTitle}`;
                const chUrl = `${this.source.baseUrl}/s/${storyId}/${chNum}/${slug}`;

                chapters.push({
                    name: chTitle,
                    url: chUrl,
                    dateUpload: dateUpload,
                    scanlator: author || "Fictionpress"
                });
            }
        } else {
            chapters.push({
                name: "Chapter 1",
                url: url,
                dateUpload: dateUpload,
                scanlator: author || "Fictionpress"
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
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 403 || res.statusCode === 503) {
            throw new Error(`Cloudflare protection active (${res.statusCode}). Please open WebView to solve challenge.`);
        }
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
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Update Date", value: "1" },
                    { type_name: "SelectOption", name: "Publish Date", value: "2" },
                    { type_name: "SelectOption", name: "Reviews", value: "3" },
                    { type_name: "SelectOption", name: "Favorites", value: "4" },
                    { type_name: "SelectOption", name: "Follows", value: "5" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
