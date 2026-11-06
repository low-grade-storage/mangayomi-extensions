const mangayomiSources = [{
    "name": "Baen Books",
    "lang": "en",
    "baseUrl": "https://www.baen.com",
    "apiUrl": "",
    "iconUrl": "https://www.baen.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
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
                if (item.images && item.images.length > 0) {
                    imageUrl = item.images[0].path || item.images[0].url || "";
                }
                if (!imageUrl && item.image) imageUrl = item.image;
                bookList.push({
                    name: name,
                    link: link.startsWith("http") ? link : `${this.source.baseUrl}${link}`,
                    imageUrl: imageUrl.startsWith("http") ? imageUrl : (imageUrl ? `${this.source.baseUrl}${imageUrl}` : "")
                });
            }
            const total = data.totalBooks || (data.count ? data.count : 0);
            return { list: bookList, hasNextPage: bookList.length >= 20 };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }
    async getPopular(page) {
        const url = `${this.source.baseUrl}/allbooks/category/getBooks?categoryId=2012&page=${page}&pageSize=20`;
        return await this.parseJsonBooks(url);
    }
    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/allbooks/category/getBooks?categoryId=2012&page=${page}&pageSize=20`;
        return await this.parseJsonBooks(url);
    }
    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/allbooks/category/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=20`;
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
        const doc = new Document(res.body);
        const titleEl = queryFirst(doc, ["h1.page-title span", "h1.page-title", "h1"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown Title";
        const imgEl = queryFirst(doc, ["img.gallery-placeholder__image", ".fotorama__img", "img[src*='catalog/product']"]);
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
        }
        const descEl = queryFirst(doc, [".product.attribute.description .value", "div.description", "#description"]);
        const description = descEl ? descEl.text.trim() : "";
        const authorEl = queryFirst(doc, [".product-author", "span.author", "div.author"]);
        const author = authorEl ? authorEl.text.trim() : "";
        const readLinks = doc.select("a[href*='readonline']");
        let readOnlineUrl = "";
        if (readLinks.length > 0) {
            const rHref = readLinks[0].attr("href");
            readOnlineUrl = rHref.startsWith("http") ? rHref : `${this.source.baseUrl}${rHref}`;
        }
        const chapters = [];
        if (readOnlineUrl) {
            const roRes = await client.get(readOnlineUrl, this.getHeaders(readOnlineUrl));
            if (roRes.statusCode === 200) {
                const roDoc = new Document(roRes.body);
                const chLinks = roDoc.select("a[href*='chapter=']");
                const seen = new Set();
                for (const a of chLinks) {
                    let href = a.attr("href") || "";
                    if (!href) continue;
                    if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
                    if (seen.has(href)) continue;
                    seen.add(href);
                    const chTitle = a.text.trim();
                    if (!chTitle) continue;
                    chapters.push({
                        name: chTitle,
                        url: href,
                        scanlator: "Baen Books"
                    });
                }
            }
        }
        if (chapters.length === 0 && readOnlineUrl) {
            chapters.push({
                name: "Read Online (Full Book)",
                url: readOnlineUrl,
                scanlator: "Baen Books"
            });
        }
        return {
            name,
            link: url,
            imageUrl,
            description,
            author,
            genre: ["Science Fiction", "Fantasy"],
            status: 1, 
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
        return [];
    }
    getSourcePreferences() {
        return [];
    }
}
