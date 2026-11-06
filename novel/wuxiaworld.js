const mangayomiSources = [{
    "name": "Wuxiaworld",
    "lang": "en",
    "baseUrl": "https://www.wuxiaworld.com",
    "apiUrl": "https://www.wuxiaworld.com/api",
    "iconUrl": "https://www.wuxiaworld.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/wuxiaworld.js",
    "hasCloudflare": true,
    "notes": "Chinese, Korean, and English martial arts and fantasy light novels"
}];

const b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function btoaPolyfill(str) {
    let out = "";
    for (let i = 0; i < str.length; i += 3) {
        const c1 = str.charCodeAt(i);
        const c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN;
        const c3 = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN;
        out += b64chars.charAt(c1 >> 2);
        out += b64chars.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : (c2 >> 4)));
        out += isNaN(c2) ? "=" : b64chars.charAt(((c2 & 15) << 2) | (isNaN(c3) ? 0 : (c3 >> 6)));
        out += isNaN(c3) ? "=" : b64chars.charAt(c3 & 63);
    }
    return out;
}

function atobPolyfill(str) {
    let out = "";
    const cleanStr = str.replace(/[^A-Za-z0-9+/=]/g, "");
    for (let i = 0; i < cleanStr.length; i += 4) {
        const enc1 = b64chars.indexOf(cleanStr.charAt(i));
        const enc2 = b64chars.indexOf(cleanStr.charAt(i + 1));
        const enc3 = b64chars.indexOf(cleanStr.charAt(i + 2));
        const enc4 = b64chars.indexOf(cleanStr.charAt(i + 3));

        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;

        out += String.fromCharCode(chr1);
        if (enc3 !== 64 && enc3 !== -1 && cleanStr.charAt(i + 2) !== "=") out += String.fromCharCode(chr2);
        if (enc4 !== 64 && enc4 !== -1 && cleanStr.charAt(i + 3) !== "=") out += String.fromCharCode(chr3);
    }
    return out;
}

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
    return typeof btoa === "function" ? btoa(bin) : btoaPolyfill(bin);
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
    const bin = typeof atob === "function" ? atob(dataB64) : atobPolyfill(dataB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    if (bytes.length <= 5) return [];
    const protoBytes = bytes.slice(5);
    const root = decodeProto(protoBytes);
    const groupItems = root[1] || [];
    const chapters = [];

    for (let gIdx = 0; gIdx < groupItems.length; gIdx++) {
        const groupBuf = groupItems[gIdx];
        const group = decodeProto(groupBuf);
        const groupTitle = group[2] ? bytesToString(group[2][0]) : "";
        const chapterItems = group[6] || [];

        for (let cIdx = 0; cIdx < chapterItems.length; cIdx++) {
            const chBuf = chapterItems[cIdx];
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
            if (!dateUpload) dateUpload = "1680000000000";

            if (name && slug) {
                chapters.push({
                    name: groupTitle ? `${groupTitle}: ${name}` : name,
                    slug: slug,
                    dateUpload: dateUpload
                });
            }
        }
    }
    return chapters;
}

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
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
        let genreVal = "";
        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter" && f.name === "Genre" && f.values && f.values[f.state]) {
                    genreVal = f.values[f.state].value;
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/api/novels/search?query=${encodeURIComponent(query.trim())}`;
            const res = await client.get(url, this.getHeaders(url));
            if (res.statusCode !== 200) {
                return { list: [], hasNextPage: false };
            }
            try {
                const data = JSON.parse(res.body);
                const items = data.items || (Array.isArray(data) ? data : []);
                const bookList = [];
                for (const item of items) {
                    const name = item.name || item.title || "";
                    const slug = item.slug || item.id || "";
                    if (!name || !slug) continue;
                    bookList.push({
                        name: name,
                        link: `${this.source.baseUrl}/novel/${slug}`,
                        imageUrl: item.coverUrl || item.cover || ""
                    });
                }
                return { list: bookList, hasNextPage: false };
            } catch (_) {
                return { list: [], hasNextPage: false };
            }
        }

        let url = `${this.source.baseUrl}/api/novels`;
        if (genreVal) url += `?genre=${encodeURIComponent(genreVal)}`;
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };

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
                bookList.push({
                    name: name,
                    link: `${this.source.baseUrl}/novel/${slug}`,
                    imageUrl: item.coverUrl || item.cover || ""
                });
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

        // Extract novel state and ID
        let novelId = null;
        let name = "Unknown Title";
        let imageUrl = "";
        let description = "";
        let author = "";
        const genres = [];
        let status = 0;

        const stateMatch = html.match(/window\.__REACT_QUERY_STATE__\s*=\s*(\{.*?\});\s*(?:<\/script>|\n)/);
        if (stateMatch) {
            try {
                const stateData = JSON.parse(stateMatch[1]);
                const queries = stateData.queries || [];
                for (const q of queries) {
                    const d = q.state?.data;
                    if (d?.item) {
                        const item = d.item;
                        if (item.id) novelId = item.id;
                        if (item.name) name = item.name;
                        if (item.coverUrl) imageUrl = item.coverUrl;
                        if (item.synopsis || item.description) description = item.synopsis || item.description;
                        if (item.authorName) author = item.authorName;
                        if (Array.isArray(item.genres)) {
                            for (const g of item.genres) {
                                const gn = typeof g === "string" ? g : (g.name || g.title);
                                if (gn && !genres.includes(gn)) genres.push(gn);
                            }
                        }
                        if (item.status === 0 || item.status === "COMPLETED") status = 1;
                        break;
                    }
                }
            } catch (_) {}
        }

        if (!novelId) {
            const idMatch = html.match(/"item":\{"id":(\d+)/) || html.match(/"novelId":(\d+)/) || html.match(/"id":(\d+),"name":/);
            if (idMatch) novelId = parseInt(idMatch[1]);
        }

        if (name === "Unknown Title") {
            const titleEl = queryFirst(doc, ["h1", ".novel-title", "h2"]);
            if (titleEl) name = titleEl.text.trim();
        }

        if (!imageUrl) {
            const imgEl = queryFirst(doc, ["img.novel-cover", ".media-left img", "img[src*='cover']"]);
            if (imgEl) imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
        }

        if (!description) {
            const descEl = queryFirst(doc, [".fr-view", ".synopsis", ".novel-body", "div.content"]);
            if (descEl) description = descEl.text.trim();
        }

        if (!author) {
            const authorEl = queryFirst(doc, [".author", "span.author", "a[href*='/author/']"]);
            if (authorEl) author = authorEl.text.trim();
        }

        const chapters = [];

        // Query all chapters via Wuxiaworld gRPC-web endpoint
        if (novelId) {
            try {
                const grpcBody = makeGrpcWebTextRequest(novelId);
                const grpcHeaders = {
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
                            scanlator: author || "Wuxiaworld"
                        });
                    }
                }
            } catch (_) {}
        }

        // Fallback: scan any HTML chapter links if gRPC failed
        if (chapters.length === 0) {
            const chapterLinks = doc.select(".chapter-item a, .chapter-list a, a[href*='/chapter']");
            const seen = new Set();
            for (const a of chapterLinks) {
                let href = a.attr("href") || "";
                if (!href || href === "#") continue;
                if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
                if (seen.has(href)) continue;
                seen.add(href);

                const chTitle = a.text.trim();
                if (!chTitle) continue;

                chapters.push({
                    name: chTitle,
                    url: href,
                    dateUpload: "1680000000000",
                    scanlator: author || "Wuxiaworld"
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
        return [
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Genres", value: "" },
                    { type_name: "SelectOption", name: "Action", value: "Action" },
                    { type_name: "SelectOption", name: "Adventure", value: "Adventure" },
                    { type_name: "SelectOption", name: "Fantasy", value: "Fantasy" },
                    { type_name: "SelectOption", name: "Martial Arts", value: "Martial Arts" },
                    { type_name: "SelectOption", name: "Xuanhuan", value: "Xuanhuan" },
                    { type_name: "SelectOption", name: "Xianxia", value: "Xianxia" },
                    { type_name: "SelectOption", name: "Romance", value: "Romance" },
                    { type_name: "SelectOption", name: "Sci-fi", value: "Sci-fi" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
