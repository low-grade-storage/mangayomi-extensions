const mangayomiSources = [{
    "name": "Project Gutenberg",
    "lang": "en",
    "baseUrl": "https://www.gutenberg.org",
    "apiUrl": "",
    "iconUrl": "https://www.gutenberg.org/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/project_gutenberg.js",
    "hasCloudflare": false,
    "notes": "Free public domain books and literary classics"
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

        const items = doc.select("li.booklink");
        for (const item of items) {
            const a = queryFirst(item, ["a.link"]);
            if (!a) continue;

            let href = a.attr("href") || "";
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);

            const titleEl = queryFirst(item, ["span.title"]);
            const title = titleEl ? titleEl.text.trim() : "";
            if (!title) continue;

            const img = queryFirst(item, ["img.cover-thumb"]);
            let imageUrl = "";
            if (img) {
                let src = img.attr("src") || "";
                if (src.includes("small.jpg")) {
                    src = src.replace("small.jpg", "medium.jpg");
                }
                imageUrl = src.startsWith("http") ? src : `${this.source.baseUrl}${src.startsWith("/") ? "" : "/"}${src}`;
            }

            bookList.push({
                name: title,
                link: href,
                imageUrl: imageUrl
            });
        }

        const paginationLinks = doc.select("li.next a, a");
        const hasNextPage = paginationLinks.some(l => l.text.toLowerCase().includes("next"));
        return { list: bookList, hasNextPage: hasNextPage || bookList.length >= 25 };
    }

    get supportsLatest() {
        return true;
    }

    async getPopular(page) {
        const startIndex = (page - 1) * 25 + 1;
        const url = `${this.source.baseUrl}/ebooks/search/?sort_order=downloads&start_index=${startIndex}`;
        return await this.parseBooks(url);
    }

    async getLatestUpdates(page) {
        const startIndex = (page - 1) * 25 + 1;
        const url = `${this.source.baseUrl}/ebooks/search/?sort_order=release_date&start_index=${startIndex}`;
        return await this.parseBooks(url);
    }

    async search(query, page, filters) {
        const startIndex = (page - 1) * 25 + 1;
        let sortOrder = "downloads";
        let categoryQuery = "";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Sort Order" && f.values && f.values[f.state]) {
                        sortOrder = f.values[f.state].value;
                    } else if (f.name === "Category" && f.values && f.values[f.state]) {
                        categoryQuery = f.values[f.state].value;
                    }
                }
            }
        }

        let q = query ? query.trim() : "";
        if (categoryQuery) {
            q = q ? `${q} ${categoryQuery}` : categoryQuery;
        }

        const url = `${this.source.baseUrl}/ebooks/search/?query=${encodeURIComponent(q)}&sort_order=${sortOrder}&start_index=${startIndex}`;
        return await this.parseBooks(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load book (${res.statusCode})`);
        }
        const html = res.body;
        const doc = new Document(html);

        const idMatch = url.match(/\/ebooks\/(\d+)/);
        const bookId = idMatch ? idMatch[1] : "";

        const titleEl = queryFirst(doc, ["h1[itemprop='name']", "h1", "td[itemprop='headline']"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown";

        const authorEl = queryFirst(doc, ["a[itemprop='creator']", "td a[href*='/authors/']", "a[rel='marcrel:aut']"]);
        const author = authorEl ? authorEl.text.trim() : "";

        const descEl = queryFirst(doc, ["td[property='dcterms:description']", "#about_book_table"]);
        const description = descEl ? descEl.text.trim() : `Project Gutenberg eBook #${bookId}`;

        let imageUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.cover.medium.jpg`;

        const genres = [];
        const subjectElems = doc.select("a[href*='/ebooks/subject/']");
        for (const s of subjectElems) {
            const st = s.text.trim();
            if (st && !genres.includes(st)) genres.push(st);
        }

        // Extract accurate release / publication date
        let dateUpload = "1096588800000"; // default 2004-10-01
        const dateEl = queryFirst(doc, ["td[itemprop='datePublished']", "tr[property*='issued'] td"]);
        if (dateEl && dateEl.text.trim()) {
            const parsed = parseDateMs(dateEl.text.trim());
            if (parsed) dateUpload = parsed;
        } else {
            const rowMatch = html.match(/Release Date<\/th>\s*<td[^>]*>(.*?)<\/td>/i) ||
                             html.match(/property="dcterms:issued"[^>]*content="([^"]+)"/i);
            if (rowMatch) {
                const parsed = parseDateMs(rowMatch[1]);
                if (parsed) dateUpload = parsed;
            }
        }

        // Dynamically find online reading URL from file table
        let readOnlineUrl = "";
        const fileLinks = doc.select("table.files a, #download_table a");
        for (const fl of fileLinks) {
            const flText = fl.text.toLowerCase();
            const flHref = fl.attr("href") || "";
            if (flText.includes("read online") || flHref.includes(".html") || flHref.includes("-images.html")) {
                readOnlineUrl = flHref.startsWith("http") ? flHref : `${this.source.baseUrl}${flHref.startsWith("/") ? "" : "/"}${flHref}`;
                break;
            }
        }
        if (!readOnlineUrl) {
            readOnlineUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}-images.html`;
        }

        const chapters = [{
            name: "Complete Book (Full Text)",
            url: readOnlineUrl,
            dateUpload: dateUpload,
            scanlator: author || "Project Gutenberg"
        }];

        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: genres,
            status: 1, // Gutenberg works are public domain completed classics
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load book text (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const content = queryFirst(doc, ["#pg-boilerplate-container + div", "body", "main", "article"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }

        const paragraphs = doc.select("p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }

        throw new Error("Empty text");
    }

    async cleanHtmlContent(html) {
        return html;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort Order",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Popular (Downloads)", value: "downloads" },
                    { type_name: "SelectOption", name: "Release Date", value: "release_date" },
                    { type_name: "SelectOption", name: "Title", value: "title" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Categories", value: "" },
                    { type_name: "SelectOption", name: "Science Fiction", value: "Science fiction" },
                    { type_name: "SelectOption", name: "Horror", value: "Horror" },
                    { type_name: "SelectOption", name: "Gothic", value: "Gothic" },
                    { type_name: "SelectOption", name: "Romance", value: "Romance" },
                    { type_name: "SelectOption", name: "Adventure", value: "Adventure" },
                    { type_name: "SelectOption", name: "Historical Fiction", value: "Historical" },
                    { type_name: "SelectOption", name: "Mystery", value: "Mystery" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
