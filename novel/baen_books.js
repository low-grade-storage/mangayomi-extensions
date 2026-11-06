const mangayomiSources = [{
    "name": "Baen Books",
    "lang": "en",
    "baseUrl": "https://www.baen.com",
    "apiUrl": "",
    "iconUrl": "https://www.baen.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/baen_books.js",
    "hasCloudflare": false,
    "notes": "Baen Free Library science fiction and fantasy publications"
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

    // Check month year like 'February 2000'
    const myMatch = s.match(/([A-Za-z]+)\s+(\d{4})/);
    if (myMatch) {
        const t = Date.parse(`${myMatch[1]} 1, ${myMatch[2]}`);
        if (!isNaN(t)) return t.toString();
    }

    // Check year only like '2000'
    const yMatch = s.match(/\b(19\d\d|20\d\d)\b/);
    if (yMatch) {
        const t = Date.parse(`${yMatch[1]}-01-01`);
        if (!isNaN(t)) return t.toString();
    }

    const t = Date.parse(s);
    if (!isNaN(t)) return t.toString();
    return null;
}

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.source.baseUrl}/`,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/html, */*"
        };
    }

    get supportsLatest() {
        return true;
    }

    async parseJsonBooks(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }

        try {
            const data = JSON.parse(res.body);
            const items = data.productData || [];
            const bookList = [];

            for (const item of items) {
                const name = item.name || item.title || "";
                const link = item.productUrl || "";
                if (!name || !link) continue;

                let imageUrl = "";
                if (Array.isArray(item.imageUrl) && item.imageUrl.length > 0) {
                    imageUrl = item.imageUrl[0];
                } else if (typeof item.imageUrl === "string" && item.imageUrl) {
                    imageUrl = item.imageUrl;
                } else if (item.images && item.images.length > 0) {
                    imageUrl = item.images[0].path || item.images[0].url || "";
                } else if (item.image) {
                    imageUrl = item.image;
                }

                if (imageUrl && !imageUrl.startsWith("http")) {
                    imageUrl = `${this.source.baseUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
                }

                bookList.push({
                    name: name,
                    link: link.startsWith("http") ? link : `${this.source.baseUrl}${link.startsWith("/") ? "" : "/"}${link}`,
                    imageUrl: imageUrl
                });
            }

            return { list: bookList, hasNextPage: bookList.length >= 20 };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/allbooks/category/getBooks?categoryId=2012&page=${page}&pageSize=20&order=release_date&dir=DESC`;
        return await this.parseJsonBooks(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/allbooks/category/getBooks?categoryId=2012&page=${page}&pageSize=20&order=latest_update&dir=DESC`;
        return await this.parseJsonBooks(url);
    }

    async search(query, page, filters) {
        let catId = "2012";
        let order = "release_date";
        let dir = "DESC";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Category" && f.values && f.values[f.state]) {
                        catId = f.values[f.state].value;
                    }
                } else if (f.type_name === "SortFilter") {
                    if (f.values && f.state) {
                        const idx = f.state.index || 0;
                        if (f.values[idx]) {
                            order = f.values[idx].value;
                            dir = f.state.ascending ? "ASC" : "DESC";
                        }
                    }
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/allbooks/category/search?q=${encodeURIComponent(query.trim())}&page=${page}&pageSize=20&categoryId=${catId}`;
            return await this.parseJsonBooks(url);
        }

        const url = `${this.source.baseUrl}/allbooks/category/getBooks?categoryId=${catId}&page=${page}&pageSize=20&order=${order}&dir=${dir}`;
        return await this.parseJsonBooks(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.source.baseUrl}/`
        });
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load book details (${res.statusCode})`);
        }
        const html = res.body;
        const doc = new Document(html);

        const titleEl = queryFirst(doc, ["h1.page-title span", "h1.page-title", "h1"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown Title";

        const imgEl = queryFirst(doc, ["img.gallery-placeholder__image", ".fotorama__img", "img[src*='catalog/product']", "meta[property='og:image']"]);
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("src") || imgEl.attr("content") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
            else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
        }

        const descEl = queryFirst(doc, [".product.attribute.description .value", "div.description", "#description", "meta[property='og:description']"]);
        let description = descEl ? (descEl.text || descEl.attr("content") || "").trim() : "";

        let author = "";
        const authorEl = queryFirst(doc, ["a.author-name-link", "a.author-name-mobile-link", ".product-author", "span.author"]);
        if (authorEl && authorEl.text.trim()) {
            author = authorEl.text.trim();
        } else {
            const byMatch = html.match(/by\s+([A-Z][a-zA-Z\.\s]+?)(?: - WebScription|[\r\n\<\"]|$)/);
            if (byMatch) author = byMatch[1].trim();
        }

        let dateUploadMs = null;
        const dateMatch = html.match(/First printing,\s*([A-Za-z]+\s+\d{4})/i) || 
                          html.match(/Copyright[^\w\n<]*(\d{4})/i) ||
                          html.match(/name="Copyright"[^>]*content="[^"]*(\d{4})/i);
        if (dateMatch) {
            dateUploadMs = parseDateMs(dateMatch[1]);
        }

        // Extract readonline link
        const readLinks = doc.select("a[href*='readonline']");
        let readOnlineUrl = "";
        if (readLinks.length > 0) {
            const rHref = readLinks[0].attr("href");
            readOnlineUrl = rHref.startsWith("http") ? rHref : `${this.source.baseUrl}${rHref.startsWith("/") ? "" : "/"}${rHref}`;
        }

        const chapters = [];
        if (readOnlineUrl) {
            const roRes = await client.get(readOnlineUrl, this.getHeaders(readOnlineUrl));
            if (roRes.statusCode === 200) {
                const roHtml = roRes.body;
                const roDoc = new Document(roHtml);

                if (!dateUploadMs) {
                    const roDateMatch = roHtml.match(/First printing,\s*([A-Za-z]+\s+\d{4})/i) || 
                                        roHtml.match(/Copyright[^\w\n<]*(\d{4})/i) ||
                                        roHtml.match(/content="[^"]*(\d{4})[^"]*by/i);
                    if (roDateMatch) {
                        dateUploadMs = parseDateMs(roDateMatch[1]);
                    }
                }

                if (!author) {
                    const roAuthorMatch = roHtml.match(/Copyright[^\n<]{0,30}by\s+([^"\<\n\r]+)/i);
                    if (roAuthorMatch) {
                        author = roAuthorMatch[1].replace(/[\.]/g, "").trim();
                    }
                }

                const chLinks = roDoc.select("a[href*='chapter=']");
                const seen = new Set();
                let chIndex = 0;

                for (const a of chLinks) {
                    let href = a.attr("href") || "";
                    if (!href) continue;
                    if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
                    if (seen.has(href)) continue;
                    seen.add(href);

                    const rawTitle = a.text.trim();
                    if (!rawTitle) continue;

                    chIndex++;
                    let chName = rawTitle;
                    if (/^\d+$/.test(rawTitle)) {
                        chName = `Chapter ${rawTitle}`;
                    } else if (rawTitle.toLowerCase() === "p" || rawTitle.toLowerCase() === "prologue") {
                        chName = "Prologue";
                    }

                    chapters.push({
                        name: chName,
                        url: href,
                        dateUpload: dateUploadMs || "949363200000",
                        scanlator: author || "Baen Books"
                    });
                }
            }
        }

        if (chapters.length === 0 && readOnlineUrl) {
            chapters.push({
                name: "Complete Book (Read Online)",
                url: readOnlineUrl,
                dateUpload: dateUploadMs || "949363200000",
                scanlator: author || "Baen Books"
            });
        }

        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: ["Science Fiction", "Fantasy"],
            status: 1, // Baen published catalog books are complete
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.source.baseUrl}/`
        });
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load chapter (${res.statusCode})`);
        }
        const doc = new Document(res.body);

        const content = queryFirst(doc, ["#bookData", "div#bookData", ".book-content", "main"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }

        const paragraphs = doc.select("#bookData p, .book-content p, p");
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
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Baen Free Library", value: "2012" },
                    { type_name: "SelectOption", name: "All Books", value: "1972" },
                    { type_name: "SelectOption", name: "eARCs", value: "2000" },
                    { type_name: "SelectOption", name: "Monthly Bundles", value: "1999" },
                    { type_name: "SelectOption", name: "Young Adult", value: "2007" },
                    { type_name: "SelectOption", name: "Grantville Gazette", value: "2074" }
                ]
            },
            {
                type_name: "SortFilter",
                name: "Sort",
                state: { index: 0, ascending: false },
                values: [
                    { type_name: "SelectOption", name: "Release Date", value: "release_date" },
                    { type_name: "SelectOption", name: "Title", value: "name" },
                    { type_name: "SelectOption", name: "Price", value: "price" },
                    { type_name: "SelectOption", name: "Publish Date", value: "publish_date" },
                    { type_name: "SelectOption", name: "Latest Updates", value: "latest_update" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
