const mangayomiSources = [{
    "name": "Wuxiaworld",
    "lang": "en",
    "baseUrl": "https://www.wuxiaworld.com",
    "apiUrl": "https://www.wuxiaworld.com/api",
    "iconUrl": "https://www.wuxiaworld.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
    "pkgPath": "novel/src/en/wuxiaworld.js",
    "hasCloudflare": true,
    "notes": "Chinese, Korean, and English martial arts and fantasy light novels"
}];
function queryFirst(parent, selectors) {
    for (const sel of selectors) {
        const list = parent.select(sel);
        if (list && list.length > 0) return list[0];
    }
    return null;
}
function encodeVarint(val) {
    const bytes = [];
    while (val > 0x7f) {
        bytes.push((val & 0x7f) | 0x80);
        val >>>= 7;
    }
    bytes.push(val);
    return bytes;
}
function makeGrpcWebTextRequest(novelId) {
    const payloadBytes = [0x08, ...encodeVarint(novelId)];
    const len = payloadBytes.length;
    const frame = [
        0,
        (len >>> 24) & 0xff,
        (len >>> 16) & 0xff,
        (len >>> 8) & 0xff,
        len & 0xff,
        ...payloadBytes
    ];
    let bin = "";
    for (let i = 0; i < frame.length; i++) {
        bin += String.fromCharCode(frame[i]);
    }
    return btoa(bin);
}
function parseVarint(bytes, offset) {
    let res = 0;
    let shift = 0;
    while (offset < bytes.length) {
        const b = bytes[offset++];
        res |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return [res, offset];
}
function decodeProto(bytes) {
    const fields = {};
    let offset = 0;
    while (offset < bytes.length) {
        const [key, nextOffset] = parseVarint(bytes, offset);
        offset = nextOffset;
        const wireType = key & 7;
        const fieldNum = key >>> 3;
        if (wireType === 0) {
            const [val, afterVal] = parseVarint(bytes, offset);
            offset = afterVal;
            if (!fields[fieldNum]) fields[fieldNum] = [];
            fields[fieldNum].push(val);
        } else if (wireType === 2) {
            const [len, afterLen] = parseVarint(bytes, offset);
            const data = bytes.slice(afterLen, afterLen + len);
            offset = afterLen + len;
            if (!fields[fieldNum]) fields[fieldNum] = [];
            fields[fieldNum].push(data);
        } else if (wireType === 1) {
            offset += 8;
        } else if (wireType === 5) {
            offset += 4;
        } else {
            break;
        }
    }
    return fields;
}
function bytesToString(bytes) {
    let out = "";
    let i = 0;
    while (i < bytes.length) {
        const c = bytes[i++];
        if (c < 128) {
            out += String.fromCharCode(c);
        } else if (c > 191 && c < 224) {
            const c2 = bytes[i++];
            out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
        } else if (c > 223 && c < 240) {
            const c2 = bytes[i++];
            const c3 = bytes[i++];
            out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
        }
    }
    return out;
}
function parseGrpcWebTextResponse(base64Text) {
    let dataB64 = base64Text.trim();
    const eqIdx = dataB64.indexOf("=");
    if (eqIdx !== -1) {
        let padEnd = eqIdx;
        while (padEnd < dataB64.length && dataB64[padEnd] === "=") padEnd++;
        dataB64 = dataB64.slice(0, padEnd);
    }
    const bin = atob(dataB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    if (bytes.length <= 5) return [];
    const protoBytes = bytes.slice(5);
    const root = decodeProto(protoBytes);
    const groupItems = root[1] || [];
    const chapters = [];
    for (const groupBuf of groupItems) {
        const group = decodeProto(groupBuf);
        const chapterItems = group[6] || [];
        for (const chBuf of chapterItems) {
            const ch = decodeProto(chBuf);
            const name = ch[2] ? bytesToString(ch[2][0]) : '';
            const slug = ch[3] ? bytesToString(ch[3][0]) : '';
            let dateUpload = null;
            if (ch[18]) {
                const ts = decodeProto(ch[18][0]);
                if (ts[1]) {
                    dateUpload = (ts[1][0] * 1000).toString();
                }
            }
            if (name && slug) {
                chapters.push({ name, slug, dateUpload });
            }
        }
    }
    return chapters;
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
        const url = `${this.source.baseUrl}/api/novels`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        try {
            const data = JSON.parse(res.body);
            const items = data.items || (Array.isArray(data) ? data : []);
            const pageSize = 20;
            const start = (page - 1) * pageSize;
            const pageItems = items.slice(start, start + pageSize);
            const bookList = [];
            for (const item of pageItems) {
                const name = item.name || item.title || "";
                const slug = item.slug || item.id || "";
                if (!name || !slug) continue;
                const link = `${this.source.baseUrl}/novel/${slug}`;
                const imageUrl = item.coverUrl || item.cover || "";
                bookList.push({ name, link, imageUrl });
            }
            return { list: bookList, hasNextPage: start + pageSize < items.length };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }
    async getLatestUpdates(page) {
        const client = new Client();
        const url = `${this.source.baseUrl}/api/novels`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        try {
            const data = JSON.parse(res.body);
            let items = data.items || (Array.isArray(data) ? data : []);
            items = items.slice().reverse();
            const pageSize = 20;
            const start = (page - 1) * pageSize;
            const pageItems = items.slice(start, start + pageSize);
            const bookList = [];
            for (const item of pageItems) {
                const name = item.name || item.title || "";
                const slug = item.slug || item.id || "";
                if (!name || !slug) continue;
                const link = `${this.source.baseUrl}/novel/${slug}`;
                const imageUrl = item.coverUrl || item.cover || "";
                bookList.push({ name, link, imageUrl });
            }
            return { list: bookList, hasNextPage: start + pageSize < items.length };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }
    async search(query, page, filters) {
        const client = new Client();
        const url = `${this.source.baseUrl}/api/novels/search?query=${encodeURIComponent(query)}`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            return { list: [], hasNextPage: false };
        }
        try {
            const data = JSON.parse(res.body);
            const items = data.items || (Array.isArray(data) ? data : []);
            const pageSize = 20;
            const start = (page - 1) * pageSize;
            const pageItems = items.slice(start, start + pageSize);
            const bookList = [];
            for (const item of pageItems) {
                const name = item.name || item.title || "";
                const slug = item.slug || item.id || "";
                if (!name || !slug) continue;
                const link = `${this.source.baseUrl}/novel/${slug}`;
                const imageUrl = item.coverUrl || item.cover || "";
                bookList.push({ name, link, imageUrl });
            }
            return { list: bookList, hasNextPage: start + pageSize < items.length };
        } catch (_) {
            return { list: [], hasNextPage: false };
        }
    }
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load novel details (${res.statusCode})`);
        }
        const html = res.body;
        const doc = new Document(html);
        const slugMatch = url.match(/\/novel\/([^/?#]+)/);
        const novelSlug = slugMatch ? slugMatch[1] : "";
        let novelId = null;
        const idMatch = html.match(/"item":\{"id":(\d+)/) || html.match(/"novelId":(\d+)/) || html.match(/"id":(\d+),"name":/);
        if (idMatch) {
            novelId = parseInt(idMatch[1]);
        }
        const titleEl = queryFirst(doc, ["h1", ".novel-title", "h2"]);
        const name = titleEl ? titleEl.text.trim() : "Unknown Title";
        const imgEl = queryFirst(doc, ["img.novel-cover", ".media-left img", "img[src*='cover']"]);
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
            if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
        }
        const descEl = queryFirst(doc, [".fr-view", ".synopsis", ".novel-body", "div.content"]);
        const description = descEl ? descEl.text.trim() : "";
        const authorEl = queryFirst(doc, [".author", "span.author"]);
        const author = authorEl ? authorEl.text.trim() : "";
        const genres = [];
        const genreElems = doc.select(".genres a, .tags a, a[href*='/genre/']");
        for (const g of genreElems) {
            const gt = g.text.trim();
            if (gt && !genres.includes(gt)) genres.push(gt);
        }
        const status = html.toLowerCase().includes('"status":0') || html.toLowerCase().includes("completed") ? 1 : 0;
        const chapters = [];
        if (novelId) {
            try {
                const grpcBody = makeGrpcWebTextRequest(novelId);
                const grpcHeaders = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Content-Type": "application/grpc-web-text",
                    "Accept": "application/grpc-web-text",
                    "Referer": url
                };
                const grpcRes = await client.post("https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapterList", grpcHeaders, grpcBody);
                if (grpcRes.statusCode === 200 && grpcRes.body) {
                    const parsedChapters = parseGrpcWebTextResponse(grpcRes.body);
                    for (const ch of parsedChapters) {
                        const chUrl = `${this.source.baseUrl}/novel/${novelSlug}/${ch.slug}`;
                        chapters.push({
                            name: ch.name,
                            url: chUrl,
                            dateUpload: ch.dateUpload,
                            scanlator: ""
                        });
                    }
                }
            } catch (_) {}
        }
        if (chapters.length === 0) {
            const chapterLinks = doc.select(".chapter-item a, .chapter-list a, a[href*='/chapter']");
            const seen = new Set();
            for (const a of chapterLinks) {
                let href = a.attr("href") || "";
                if (!href || href === "#") continue;
                if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
                if (seen.has(href)) continue;
                seen.add(href);
                const chTitle = a.text.trim();
                if (!chTitle) continue;
                chapters.push({
                    name: chTitle,
                    url: href,
                    dateUpload: null,
                    scanlator: ""
                });
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
        const content = queryFirst(doc, ["div.fr-view", "div#chapter-content", "div.chapter-content", ".p-15"]);
        if (content && content.text.trim()) {
            return content.outerHtml;
        }
        const paragraphs = doc.select(".fr-view p, #chapter-content p, .chapter-content p");
        if (paragraphs && paragraphs.length > 0) {
            return paragraphs.map(p => p.outerHtml).join("\n");
        }
        throw new Error("Empty chapter content or blocked by protection");
    }
    async cleanHtmlContent(html) {
        const doc = new Document(html);
        const paragraphs = doc.select("p");
        if (!paragraphs || paragraphs.length === 0) return html;
        return paragraphs
            .filter(p => !p.text.includes("wuxiaworld.com") && !p.text.includes("Find authorized novels"))
            .map(p => p.outerHtml)
            .join("\n");
    }
    getFilterList() {
        return [];
    }
    getSourcePreferences() {
        return [];
    }
}
