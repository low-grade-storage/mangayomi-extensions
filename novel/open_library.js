const mangayomiSources = [{
    "name": "Open Library",
    "lang": "en",
    "baseUrl": "https://openlibrary.org",
    "apiUrl": "https://openlibrary.org",
    "iconUrl": "https://openlibrary.org/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/open_library.js",
    "hasCloudflare": false,
    "notes": "Open, editable library catalog by Internet Archive with millions of book records"
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
            "Accept": "application/json, text/html, */*"
        };
    }

    get supportsLatest() {
        return true;
    }

    async getPopular(page) {
        const client = new Client();
        const url = `${this.source.baseUrl}/trending/daily.json?page=${page}`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }

        const data = JSON.parse(res.body);
        const works = data.works || [];
        const bookList = [];

        for (const w of works) {
            const title = w.title || "";
            const key = w.key || "";
            if (!title || !key) continue;

            const coverId = w.cover_i;
            const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";

            bookList.push({
                name: title,
                link: `${this.source.baseUrl}${key}`,
                imageUrl: imageUrl
            });
        }

        return { list: bookList, hasNextPage: works.length >= 20 };
    }

    async getLatestUpdates(page) {
        const client = new Client();
        const offset = (page - 1) * 20;
        const url = `${this.source.baseUrl}/subjects/fiction.json?sort=new&limit=20&offset=${offset}`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }

        const data = JSON.parse(res.body);
        const works = data.works || [];
        const bookList = [];

        for (const w of works) {
            const title = w.title || "";
            const key = w.key || "";
            if (!title || !key) continue;

            const coverId = w.cover_id || w.cover_i;
            const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";

            bookList.push({
                name: title,
                link: `${this.source.baseUrl}${key}`,
                imageUrl: imageUrl
            });
        }

        return { list: bookList, hasNextPage: works.length >= 20 };
    }

    async search(query, page, filters) {
        const client = new Client();
        let subjectVal = "";
        let sortVal = "";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Subject" && f.values && f.values[f.state]) {
                        subjectVal = f.values[f.state].value;
                    } else if (f.name === "Sort By" && f.values && f.values[f.state]) {
                        sortVal = f.values[f.state].value;
                    }
                }
            }
        }

        let url = "";
        if (query && query.trim()) {
            url = `${this.source.baseUrl}/search.json?q=${encodeURIComponent(query.trim())}&page=${page}&limit=20`;
            if (sortVal) url += `&sort=${sortVal}`;
        } else if (subjectVal) {
            const offset = (page - 1) * 20;
            url = `${this.source.baseUrl}/subjects/${subjectVal}.json?limit=20&offset=${offset}`;
            if (sortVal) url += `&sort=${sortVal}`;
        } else {
            url = `${this.source.baseUrl}/trending/daily.json?page=${page}`;
        }

        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }

        const data = JSON.parse(res.body);
        const items = data.docs || data.works || [];
        const bookList = [];

        for (const d of items) {
            const title = d.title || "";
            const key = d.key || "";
            if (!title || !key) continue;

            const coverId = d.cover_i || d.cover_id;
            const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";

            bookList.push({
                name: title,
                link: `${this.source.baseUrl}${key}`,
                imageUrl: imageUrl
            });
        }

        const numFound = data.numFound || data.num_found || (items.length >= 20 ? page * 20 + 1 : items.length);
        const hasNextPage = page * 20 < numFound;
        return { list: bookList, hasNextPage };
    }

    async getDetail(url) {
        const client = new Client();
        const jsonUrl = url.endsWith(".json") ? url : `${url.replace(/\/+$/, "")}.json`;
        const res = await client.get(jsonUrl, this.getHeaders(jsonUrl));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load work data (${res.statusCode})`);
        }

        const data = JSON.parse(res.body);
        const name = data.title || "Unknown Title";

        let description = "";
        if (typeof data.description === "string") {
            description = data.description;
        } else if (data.description && typeof data.description.value === "string") {
            description = data.description.value;
        }

        let imageUrl = "";
        if (data.covers && data.covers.length > 0 && data.covers[0] > 0) {
            imageUrl = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
        }

        const genres = Array.isArray(data.subjects) ? data.subjects.slice(0, 10) : [];

        let author = "";
        if (Array.isArray(data.authors) && data.authors.length > 0) {
            const authorKey = data.authors[0].author?.key;
            if (authorKey) {
                try {
                    const authorRes = await client.get(`${this.source.baseUrl}${authorKey}.json`, this.getHeaders(""));
                    if (authorRes.statusCode === 200) {
                        const authorData = JSON.parse(authorRes.body);
                        author = authorData.name || "";
                    }
                } catch (_) {}
            }
        }

        // Determine creation / publication timestamp
        let defaultDate = "1577836800000"; // 2020-01-01
        if (data.first_publish_date) {
            const ms = parseDateMs(data.first_publish_date);
            if (ms) defaultDate = ms;
        } else if (data.created?.value) {
            const ms = parseDateMs(data.created.value);
            if (ms) defaultDate = ms;
        } else if (data.last_modified?.value) {
            const ms = parseDateMs(data.last_modified.value);
            if (ms) defaultDate = ms;
        }

        const workKey = data.key || url.replace(this.source.baseUrl, "");
        const chapters = [];

        // Check if editions endpoint provides multiple editions
        try {
            const editionsUrl = `${this.source.baseUrl}${workKey}/editions.json?limit=25`;
            const edRes = await client.get(editionsUrl, this.getHeaders(editionsUrl));
            if (edRes.statusCode === 200) {
                const edData = JSON.parse(edRes.body);
                const entries = edData.entries || [];
                for (let i = 0; i < entries.length; i++) {
                    const e = entries[i];
                    const edTitle = e.title || `Edition ${i + 1}`;
                    const edKey = e.key;
                    if (!edKey) continue;

                    let edDate = defaultDate;
                    if (e.publish_date) {
                        const parsed = parseDateMs(e.publish_date);
                        if (parsed) edDate = parsed;
                    }

                    chapters.push({
                        name: `${edTitle} (${e.publish_date || "Open Library Edition"})`,
                        url: `${this.source.baseUrl}${edKey}`,
                        dateUpload: edDate,
                        scanlator: author || "Open Library"
                    });
                }
            }
        } catch (_) {}

        if (chapters.length === 0) {
            chapters.push({
                name: "Read Book Online (Open Library Edition)",
                url: `${this.source.baseUrl}${workKey}`,
                dateUpload: defaultDate,
                scanlator: author || "Open Library"
            });
        }

        return {
            name,
            link: `${this.source.baseUrl}${workKey}`,
            imageUrl,
            description,
            author,
            genre: genres,
            status: 1, // Archived works are completed
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load book reader (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const readContent = queryFirst(doc, [".work-description", ".edition-content", "main", "article"]);
        if (readContent && readContent.text.trim()) {
            return readContent.outerHtml;
        }

        const paragraphs = doc.select("p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }

        throw new Error("Empty content");
    }

    async cleanHtmlContent(html) {
        return html;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Subject",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Subjects", value: "" },
                    { type_name: "SelectOption", name: "Fiction", value: "fiction" },
                    { type_name: "SelectOption", name: "Science Fiction", value: "science_fiction" },
                    { type_name: "SelectOption", name: "Fantasy", value: "fantasy" },
                    { type_name: "SelectOption", name: "Romance", value: "romance" },
                    { type_name: "SelectOption", name: "Mystery", value: "mystery_and_detective_stories" },
                    { type_name: "SelectOption", name: "History", value: "history" },
                    { type_name: "SelectOption", name: "Thriller", value: "thriller" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Trending", value: "" },
                    { type_name: "SelectOption", name: "New", value: "new" },
                    { type_name: "SelectOption", name: "Old", value: "old" },
                    { type_name: "SelectOption", name: "Random", value: "random" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
