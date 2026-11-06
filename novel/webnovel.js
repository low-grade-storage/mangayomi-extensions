const mangayomiSources = [{
    "name": "Webnovel",
    "lang": "en",
    "baseUrl": "https://www.webnovel.com",
    "apiUrl": "",
    "iconUrl": "https://www.webnovel.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.2",
    "pkgPath": "novel/src/en/webnovel.js",
    "hasCloudflare": true,
    "notes": "Full catalog traversal with proper volume categorization, sequential indexing, and complete chapter reading."
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

    async parseBooks(url) {
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

        const items = doc.select(".j_category_wrapper li, .j_list_container li, ul.g_book_list li, .search-result-container li");
        for (const item of items) {
            const a = queryFirst(item, ["a.g_thumb", "a[data-bookname]", "a"]);
            if (!a) continue;

            let href = a.attr("href") || "";
            if (!href || href === "#") continue;
            if (!href.startsWith("http")) href = `${this.source.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
            if (seen.has(href)) continue;
            seen.add(href);

            const h3El = queryFirst(item, ["h3", ".g_book_name"]);
            const title = a.attr("title") || a.attr("data-bookname") || (h3El ? h3El.text.trim() : "");
            if (!title) continue;

            const img = queryFirst(item, ["img"]);
            let imgUrl = "";
            if (img) {
                imgUrl = img.attr("data-original") || img.attr("src") || "";
                if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
                else if (imgUrl.startsWith("/")) imgUrl = `${this.source.baseUrl}${imgUrl}`;
            }

            bookList.push({
                name: title,
                link: href,
                imageUrl: imgUrl
            });
        }

        const nextButtons = doc.select("a.next, .pagination li.next a, a[rel='next']");
        const hasNextPage = nextButtons.length > 0 && nextButtons[0].attr("href") !== "" && nextButtons[0].attr("href") !== "#";
        return { list: bookList, hasNextPage: hasNextPage || bookList.length >= 20 };
    }

    get supportsLatest() {
        return true;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/stories/novel?orderBy=1&pageIndex=${page}`;
        return await this.parseBooks(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/stories/novel?orderBy=5&pageIndex=${page}`;
        return await this.parseBooks(url);
    }

    async search(query, page, filters) {
        let orderVal = "1";
        let categoryVal = "";

        if (filters && Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    if (f.name === "Sort By" && f.values && f.values[f.state]) {
                        orderVal = f.values[f.state].value;
                    } else if (f.name === "Category" && f.values && f.values[f.state]) {
                        categoryVal = f.values[f.state].value;
                    }
                }
            }
        }

        if (query && query.trim()) {
            const url = `${this.source.baseUrl}/search?keywords=${encodeURIComponent(query.trim())}&pageIndex=${page}`;
            return await this.parseBooks(url);
        }

        let url = `${this.source.baseUrl}/stories/novel?orderBy=${orderVal}&pageIndex=${page}`;
        if (categoryVal) url += `&categoryType=${categoryVal}`;
        return await this.parseBooks(url);
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 403 || res.statusCode === 503) {
            throw new Error(`Cloudflare protection active (${res.statusCode}). Please open WebView to solve challenge.`);
        }
        if (res.statusCode !== 200) {
            throw new Error(`Failed to load novel (${res.statusCode})`);
        }
        const html = res.body;
        const doc = new Document(html);

        let name = "Unknown Title";
        let imageUrl = "";
        let description = "";
        let author = "";
        const genres = [];
        let status = 0;
        let defaultTimestamp = "1680000000000";

        // Strategy 1: Check embedded g_data script
        const gDataMatch = html.match(/g_data\s*=\s*(\{.*?\});\s*(?:<\/script>|\n)/);
        if (gDataMatch) {
            try {
                const gData = JSON.parse(gDataMatch[1]);
                if (gData.bookInfo) {
                    const bi = gData.bookInfo;
                    if (bi.bookName) name = bi.bookName;
                    if (bi.authorName) author = bi.authorName;
                    if (bi.description) description = bi.description;
                    if (bi.categoryName && !genres.includes(bi.categoryName)) genres.push(bi.categoryName);
                    if (bi.cover) imageUrl = bi.cover.startsWith("//") ? `https:${bi.cover}` : bi.cover;
                    if (bi.actionStatus === 1 || bi.actionStatus === "1") status = 1;
                    if (bi.updateTime) {
                        const ut = parseInt(bi.updateTime);
                        if (!isNaN(ut) && ut > 0) {
                            defaultTimestamp = (ut > 10000000000 ? ut : ut * 1000).toString();
                        }
                    }
                }
            } catch (_) {}
        }

        if (name === "Unknown Title") {
            const titleElem = queryFirst(doc, ["h1.det-hd-title", "h1", ".g_thumb img"]);
            name = titleElem ? (titleElem.text || titleElem.attr("alt") || "").trim() : "Unknown Title";
        }

        if (!imageUrl) {
            const imgElem = queryFirst(doc, [".det-hd-cover img", ".g_thumb img", "img.cover"]);
            if (imgElem) {
                imageUrl = imgElem.attr("src") || imgElem.attr("data-original") || "";
                if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
                else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
            }
        }

        if (!description) {
            const descElem = queryFirst(doc, [".j_synopsis", ".det-abt p", ".synopsis"]);
            description = descElem ? descElem.text.trim() : "";
        }

        if (!author) {
            const authorElem = queryFirst(doc, [".det-hd-detail a[href*='author']", ".author a", "address p span"]);
            author = authorElem ? authorElem.text.trim() : "";
        }

        const genreElems = doc.select(".det-hd-tag, .det-hd-detail a[href*='category'], .tags a");
        for (const g of genreElems) {
            const gt = g.text.trim();
            if (gt && !genres.includes(gt)) genres.push(gt);
        }

        const statusText = doc.text.toLowerCase();
        if (statusText.includes("completed")) status = 1;

        // Traverse catalog for chapters with proper volume categorization
        const chapters = [];
        const seenChapters = new Set();
        const catalogUrl = url.endsWith("/catalog") ? url : `${url.replace(/\/+$/, "")}/catalog`;
        const catRes = await client.get(catalogUrl, this.getHeaders(catalogUrl));

        if (catRes.statusCode === 200) {
            const catHtml = catRes.body;
            const catDoc = new Document(catHtml);

            // Single pass volume extraction to preserve exact chronological order
            const volumeElements = catDoc.select(".volume-item");
            if (volumeElements.length > 0) {
                for (let vIdx = 0; vIdx < volumeElements.length; vIdx++) {
                    const vol = volumeElements[vIdx];
                    const h4El = queryFirst(vol, ["h4"]);
                    const volHeading = h4El ? h4El.text.trim() : `Volume ${vIdx + 1}`;
                    const chapterLinks = vol.select("ol li a, ul li a");

                    for (let cIdx = 0; cIdx < chapterLinks.length; cIdx++) {
                        const a = chapterLinks[cIdx];
                        let chHref = a.attr("href") || "";
                        if (!chHref || chHref === "#") continue;
                        if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref.startsWith("/") ? "" : "/"}${chHref}`;
                        if (seenChapters.has(chHref)) continue;
                        seenChapters.add(chHref);

                        const rawTitle = (a.attr("title") || a.text || "").trim();
                        let cleanTitle = rawTitle;
                        if (/^\d+\s*[\.:\-]\s*/.test(cleanTitle)) {
                            cleanTitle = cleanTitle.replace(/^\d+\s*[\.:\-]\s*/, "");
                        }

                        const chapterNo = chapters.length + 1;
                        let displayName = rawTitle;
                        if (!displayName.toLowerCase().includes("chapter")) {
                            displayName = `Chapter ${chapterNo}: ${cleanTitle}`;
                        }
                        if (volHeading) {
                            displayName = `${volHeading} - ${displayName}`;
                        }

                        let chTimestamp = defaultTimestamp;
                        const pubTimeAttr = a.attr("data-publishtime") || a.attr("data-time");
                        if (pubTimeAttr) {
                            const pt = parseInt(pubTimeAttr);
                            if (!isNaN(pt) && pt > 0) {
                                chTimestamp = (pt > 10000000000 ? pt : pt * 1000).toString();
                            }
                        }

                        chapters.push({
                            name: displayName,
                            url: chHref,
                            dateUpload: chTimestamp,
                            scanlator: author || "Webnovel"
                        });
                    }
                }
            }

            // Fallback only if no volume-item blocks were detected
            if (chapters.length === 0) {
                const allLinks = catDoc.select(".j_catalog_list li a, .catalog-list li a, ol.chapter-list li a");
                for (let i = 0; i < allLinks.length; i++) {
                    const a = allLinks[i];
                    let chHref = a.attr("href") || "";
                    if (!chHref || chHref === "#") continue;
                    if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref.startsWith("/") ? "" : "/"}${chHref}`;
                    if (seenChapters.has(chHref)) continue;
                    seenChapters.add(chHref);

                    const rawTitle = (a.attr("title") || a.text || "").trim();
                    const chapterNo = i + 1;
                    const chTitle = rawTitle.toLowerCase().includes("chapter") ? rawTitle : `Chapter ${chapterNo}: ${rawTitle}`;

                    chapters.push({
                        name: chTitle,
                        url: chHref,
                        dateUpload: defaultTimestamp,
                        scanlator: author || "Webnovel"
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
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        if (res.statusCode === 200) {
            const doc = new Document(res.body);
            const content = queryFirst(doc, [".cha-content", ".cha-words", ".chapter-content", ".j_chapter"]);
            const paragraphs = doc.select(".cha-paragraph p, .cha-words p, div.chapter-body p");

            const isLocked = res.body.includes("Unlock this chapter") || 
                             res.body.includes("Go to App to unlock") || 
                             res.body.includes("locked-chapter") ||
                             (content && content.text.trim().length < 500);

            // If the chapter is free and completely rendered on Webnovel
            if (!isLocked && paragraphs && paragraphs.length >= 10 && content && content.text.trim().length >= 800) {
                return paragraphs.map(p => p.outerHtml).join("\n");
            }
        }

        // Mirror / Aggregator fallback to ensure 100% full chapter visibility
        try {
            const slugMatch = url.match(/\/book\/([a-zA-Z0-9\-]+)(?:_\d+)?/);
            let bookSlug = slugMatch ? slugMatch[1] : "";
            bookSlug = bookSlug.replace(/_\d+$/, "").toLowerCase();

            let chapterNum = "1";
            const chNumMatch = name.match(/chapter\s*(\d+)/i) || url.match(/_(\d+)$/);
            if (chNumMatch) chapterNum = chNumMatch[1];

            if (bookSlug && chapterNum) {
                const mirrorUrl = `https://novelphoenix.com/novel/${bookSlug}/chapter-${chapterNum}`;
                const mirrorRes = await client.get(mirrorUrl, {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://novelfire.net/"
                });
                if (mirrorRes.statusCode === 200) {
                    const mDoc = new Document(mirrorRes.body);
                    const mParas = mDoc.select("#content p, .chapter-content p, article p");
                    if (mParas && mParas.length >= 5) {
                        return mParas.map(p => p.outerHtml).join("\n");
                    }
                }
            }
        } catch (_) {}

        // Fallback to whatever paragraphs were present on original page
        if (res.statusCode === 200) {
            const doc = new Document(res.body);
            const content = queryFirst(doc, [".cha-content", ".cha-words", ".chapter-content", ".j_chapter"]);
            if (content && content.text.trim()) {
                return content.outerHtml;
            }
            const paragraphs = doc.select(".cha-paragraph p, .cha-words p, p");
            if (paragraphs && paragraphs.length > 0) {
                return paragraphs.map(p => p.outerHtml).join("\n");
            }
        }

        throw new Error("Unable to load full chapter content");
    }

    async cleanHtmlContent(html) {
        const doc = new Document(html);
        const paragraphs = doc.select("p");
        if (!paragraphs || paragraphs.length === 0) return html;
        return paragraphs
            .filter(p => !p.className.includes("para-comment") && !p.text.includes("Find authorized novels in Webnovel"))
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
                    { type_name: "SelectOption", name: "Popular", value: "1" },
                    { type_name: "SelectOption", name: "Latest Updates", value: "5" },
                    { type_name: "SelectOption", name: "Rating", value: "2" },
                    { type_name: "SelectOption", name: "Collections", value: "4" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Categories", value: "" },
                    { type_name: "SelectOption", name: "Eastern Fantasy", value: "1" },
                    { type_name: "SelectOption", name: "Video Games", value: "7" },
                    { type_name: "SelectOption", name: "Sci-fi", value: "6" },
                    { type_name: "SelectOption", name: "Contemporary Romance", value: "2" },
                    { type_name: "SelectOption", name: "Urban", value: "4" },
                    { type_name: "SelectOption", name: "History", value: "5" },
                    { type_name: "SelectOption", name: "Horror", value: "8" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
