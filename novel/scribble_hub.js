const mangayomiSources = [{
    "name": "Scribble Hub",
    "lang": "en",
    "baseUrl": "https://www.scribblehub.com",
    "apiUrl": "",
    "iconUrl": "https://www.scribblehub.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/scribble_hub.js",
    "hasCloudflare": true,
    "notes": "Original web novels and stories from Scribble Hub"
}];

function queryFirst(parent, selectors) {
    for (const sel of selectors) {
        const list = parent.select(sel);
        if (list && list.length > 0) return list[0];
    }
    return null;
}

function parseDate(str) {
    if (!str) return null;
    const raw = str.trim();
    if (!raw) return null;

    let ms = Date.parse(raw);
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

    const isoStr = raw.includes("T") ? raw : raw.replace(" ", "T");
    ms = Date.parse(isoStr);
    if (!isNaN(ms)) return ms.toString();

    return null;
}

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "Referer": `${this.source.baseUrl}/`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }

    async parseNovels(url) {
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

        const cards = doc.select(".search_main_box");
        for (const card of cards) {
            const a = queryFirst(card, [".search_title > a", "a[href*='/series/']"]);
            if (!a) continue;

            let href = a.attr("href") || "";
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);

            const title = a.text.trim();
            if (!title) continue;

            const img = queryFirst(card, [".search_img > img", "img"]);
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

        const paginationLinks = doc.select("a.next, .pagination .next, .pagination a");
        const hasNextPage = paginationLinks.some(l => l.text.toLowerCase().includes("next") || l.className.includes("next"));
        return { list: bookList, hasNextPage: hasNextPage || bookList.length >= 20 };
    }

    get supportsLatest() {
        return true;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/series-finder/?sf=1&sort=ratings&order=desc&pg=${page}`;
        return await this.parseNovels(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/latest-series/?pg=${page}`;
        return await this.parseNovels(url);
    }

    async search(query, page, filters) {
        let sortVal = "ratings";
        let orderVal = "desc";
        let genreVal = "";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Sort By" && f.values && f.values[f.state]) {
                        sortVal = f.values[f.state].value;
                    } else if (f.name === "Genre" && f.values && f.values[f.state]) {
                        genreVal = f.values[f.state].value;
                    }
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/?s=${encodeURIComponent(query.trim())}&post_type=fictionposts&paged=${page}`;
            return await this.parseNovels(url);
        }

        let url = `${this.source.baseUrl}/series-finder/?sf=1&sort=${sortVal}&order=${orderVal}&pg=${page}`;
        if (genreVal) {
            url += `&gi=${genreVal}&mgi=or`;
        }
        return await this.parseNovels(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 403 || res.statusCode === 503) {
            throw new Error(`Cloudflare protection active (${res.statusCode}). Please open WebView to solve challenge.`);
        }
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load novel details (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const titleEl = queryFirst(doc, [".fic_title", "h1"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown Title";

        const imgEl = queryFirst(doc, [".fic_image img", "div.novel-cover img", "img.cover"]);
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
            else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
        }

        const descEl = queryFirst(doc, [".wi_fic_desc", "div.description"]);
        const description = descEl ? descEl.text.trim() : "";

        const authorEl = queryFirst(doc, [".auth_name_fic", "a[href*='/profile/']"]);
        const author = authorEl ? authorEl.text.trim() : "";

        const genres = [];
        const genreElems = doc.select(".fic_genre");
        for (const g of genreElems) {
            const gt = g.text.trim();
            if (gt && !genres.includes(gt)) genres.push(gt);
        }

        const statsEl = queryFirst(doc, [".rnd_stats"]);
        const statusText = statsEl ? statsEl.nextElementSibling.text.toLowerCase() : doc.text.toLowerCase();
        const status = statusText.includes("ongoing") ? 0 : 1;

        // Fetch all chapters via pagination AJAX endpoint
        const postIdMatch = url.match(/\/series\/(\d+)/);
        const postId = postIdMatch ? postIdMatch[1] : "";
        const chapters = [];

        if (postId) {
            const ajaxUrl = `${this.source.baseUrl}/wp-admin/admin-ajax.php`;
            const postBody = `action=wi_getreleases_pagination&pagenum=-1&mypostid=${postId}`;
            const ajaxHeaders = {
                ...this.getHeaders(url),
                "Content-Type": "application/x-www-form-urlencoded"
            };

            const ajaxRes = await client.post(ajaxUrl, ajaxHeaders, postBody);
            if (ajaxRes.statusCode === 200) {
                const cDoc = new Document(ajaxRes.body);
                const tocItems = cDoc.select(".toc_w");
                let chIndex = 0;
                for (const item of tocItems) {
                    const a = queryFirst(item, ["a"]);
                    if (!a) continue;

                    let chHref = a.attr("href") || "";
                    if (!chHref) continue;
                    if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref.startsWith("/") ? "" : "/"}${chHref}`;

                    const titleSpan = queryFirst(item, [".toc_a"]) || a;
                    const chName = titleSpan.text.trim();

                    let dateUpload = null;
                    const dateElem = queryFirst(item, [".fic_date_pub"]);
                    if (dateElem && dateElem.text) {
                        dateUpload = parseDate(dateElem.text);
                    }
                    if (!dateUpload) dateUpload = "1680000000000";

                    chIndex++;
                    chapters.push({
                        name: chName,
                        url: chHref,
                        dateUpload: dateUpload,
                        scanlator: author || "Scribble Hub"
                    });
                }
            }
        }

        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: genres,
            status,
            chapters: chapters.reverse()
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

        const content = queryFirst(doc, ["div.chp_raw", "#chp_raw", ".chapter-content"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }

        const paragraphs = doc.select(".chp_raw p, #chp_raw p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }

        throw new Error("Empty chapter content or blocked by Cloudflare");
    }

    async cleanHtmlContent(html) {
        const doc = new Document(html);
        const paragraphs = doc.select("p");
        if (!paragraphs || paragraphs.length === 0) return html;
        return paragraphs
            .filter(p => !p.text.includes("scribblehub.com"))
            .map(p => p.outerHtml)
            .join("\n");
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Ratings", value: "ratings" },
                    { type_name: "SelectOption", name: "Favorites", value: "favorites" },
                    { type_name: "SelectOption", name: "Page Views", value: "pageviews" },
                    { type_name: "SelectOption", name: "Chapters", value: "chapters" },
                    { type_name: "SelectOption", name: "Word Count", value: "words" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Genres", value: "" },
                    { type_name: "SelectOption", name: "Action", value: "action" },
                    { type_name: "SelectOption", name: "Adventure", value: "adventure" },
                    { type_name: "SelectOption", name: "Comedy", value: "comedy" },
                    { type_name: "SelectOption", name: "Drama", value: "drama" },
                    { type_name: "SelectOption", name: "Fantasy", value: "fantasy" },
                    { type_name: "SelectOption", name: "Horror", value: "horror" },
                    { type_name: "SelectOption", name: "Mystery", value: "mystery" },
                    { type_name: "SelectOption", name: "Romance", value: "romance" },
                    { type_name: "SelectOption", name: "Sci-fi", value: "sci-fi" },
                    { type_name: "SelectOption", name: "Slice of Life", value: "slice-of-life" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
