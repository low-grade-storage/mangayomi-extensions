var mangayomiSources = [{"id":784920193,"name":"Thunder Scans","lang":"en","baseUrl":"https://en-thunderscans.com","apiUrl":"","iconUrl":"https://en-thunderscans.com/wp-content/uploads/2023/12/cropped-EN-TH-WEB-192x192.png","typeSource":"single","itemType":0,"isManga":true,"version":"0.0.1","dateFormat":"","dateFormatLocale":"","pkgPath":"manga/src/en/thunderscans.js"}];
var DefaultExtension = class extends MProvider {
    constructor() { super(); this.client = new Client(); }
    getHeaders(url) { return { "Referer": `${this.source.baseUrl}/`, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }; }
    get supportsLatest() { return true; }
    async request(slug) { return new Document((await this.client.get(slug.startsWith("http") ? slug : `${this.source.baseUrl}${slug.startsWith("/") ? "" : "/"}${slug}`, this.getHeaders(slug))).body); }
    async getPopular(page) { return this._parseMangaList(`/comics/?page=${Math.max(1, parseInt(page) || 1)}&order=popular`); }
    async getLatestUpdates(page) { return this._parseMangaList(`/comics/?page=${Math.max(1, parseInt(page) || 1)}&order=update`); }
    async search(query, page, filters) {
        var p = Math.max(1, parseInt(page) || 1), q = (query || "").trim(), af = (Array.isArray(filters) && filters.length) ? filters : this.getFilterList(), o = af?.[0]?.values?.[af[0]?.state]?.value ?? "", s = af?.[1]?.values?.[af[1]?.state]?.value ?? "", t = af?.[2]?.values?.[af[2]?.state]?.value ?? "", g = "";
        if (Array.isArray(af?.[3]?.state)) for (var item of af[3].state) if (item?.state && item?.value) g += `&genre%5B%5D=${encodeURIComponent(item.value)}`;
        var fq = `${o ? `&order=${encodeURIComponent(o)}` : ""}${s ? `&status=${encodeURIComponent(s)}` : ""}${t ? `&type=${encodeURIComponent(t)}` : ""}${g}`;
        return this._parseMangaList(q ? (p === 1 ? `/comics/?s=${encodeURIComponent(q)}${fq}` : `/comics/page/${p}/?s=${encodeURIComponent(q)}${fq}`) : `/comics/?page=${p}${fq}`);
    }
    async _parseMangaList(slug) {
        var doc = await this.request(slug), list = [], seen = new Set(), els = doc.select(".listupd .bsx").length ? doc.select(".listupd .bsx") : doc.select(".bsx");
        for (var el of els) {
            var a = el.selectFirst("a"), link = a ? (a.getHref || a.attr("href") || "") : "";
            if (!link || seen.has(link)) continue;
            seen.add(link);
            var titleEl = el.selectFirst(".tt, .title") || a, name = (titleEl?.text || a.attr("title") || "").trim();
            if (!name) continue;
            var img = el.selectFirst("img");
            list.push({ name, imageUrl: img ? (img.getSrc || img.attr("src") || img.attr("data-src") || "") : "", link });
        }
        var next = doc.selectFirst(".hpage a.r, a.r, .pagination a.next, a.next");
        return { list, hasNextPage: Boolean(next?.getHref || next?.attr("href")) };
    }
    statusCode(status) {
        var s = String(status || "").toLowerCase().trim();
        return s.includes("ongoing") ? 0 : s.includes("completed") ? 1 : s.includes("hiatus") ? 2 : (s.includes("canceled") || s.includes("cancelled")) ? 3 : s.includes("publishing finished") ? 4 : 5;
    }
    parseDate(str) {
        var raw = String(str || "").trim(), m = raw.match(/(\d+)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?(?:\s+ago)?/i);
        if (m) {
            var n = parseInt(m[1], 10), u = m[2].toLowerCase(), mult = u.startsWith("sec") ? 1000 : u.startsWith("min") ? 60000 : (u.startsWith("hour") || u === "hr") ? 3600000 : u.startsWith("day") ? 86400000 : u.startsWith("week") ? 604800000 : u.startsWith("month") ? 2592000000 : 31536000000;
            return String(Date.now() - n * mult);
        }
        try { var ts = Date.parse(raw); if (!Number.isNaN(ts)) return String(ts); } catch (_) {}
        return "";
    }
    async getDetail(url) {
        var doc = await this.request(url), name = doc.selectFirst("h1.entry-title")?.text.trim() || "", thumb = doc.selectFirst(".thumb img"), imageUrl = thumb ? (thumb.getSrc || thumb.attr("src") || thumb.attr("data-src") || "") : "", descEls = doc.select(".entry-content p, .entry-content-single p"), description = (descEls?.length ? descEls.map(p => p.text.trim()).filter(Boolean).join("\n\n") : doc.selectFirst(".entry-content, .entry-content-single, .desc")?.text?.trim()) || "", author = "", artist = "", status = 5;
        for (var el of doc.select(".tsinfo .imptdt, .infotable tr, .spe span")) {
            var txt = el.text.trim(), l = txt.toLowerCase(), valEl = el.selectFirst("i, td:nth-child(2), span");
            if (l.includes("status")) status = this.statusCode(valEl ? valEl.text.trim() : txt.replace(/status/i, "").trim());
            else if (l.includes("author")) author = (valEl ? valEl.text.trim() : txt.replace(/author/i, "").trim()).replace(/\[add,\s*\]/gi, "").trim();
            else if (l.includes("artist")) artist = (valEl ? valEl.text.trim() : txt.replace(/artist/i, "").trim()).replace(/\[add,\s*\]/gi, "").trim();
        }
        var genre = [];
        doc.select(".mgen a, .genres-container a, a[href*='/genres/']").forEach(a => { var g = a.text.trim(); if (g && !genre.includes(g)) genre.push(g); });
        var chapters = [];
        for (var li of doc.select("#chapterlist ul li, .eplister ul li")) {
            var a = li.selectFirst("a"), href = a?.getHref || a?.attr("href") || "";
            if (!href || href === "#" || href.startsWith("javascript:")) continue;
            chapters.push({ name: (li.selectFirst(".chapternum")?.text || a.text || "Chapter").replace(/\s+/g, " ").trim(), url: href, dateUpload: this.parseDate(li.selectFirst(".chapterdate")?.text.trim()) });
        }
        return { name, imageUrl, description, author, artist, status, genre, chapters };
    }
    async getPageList(url) {
        var target = url.startsWith("http") ? url : `${this.source.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`, html = (await this.client.get(target, this.getHeaders(target))).body || "", m = html.match(/ts_reader\.run\(\s*(\{[\s\S]+?\})\s*\);/);
        if (m) {
            try {
                var data = JSON.parse(m[1]);
                for (var src of (data?.sources || [])) if (Array.isArray(src?.images) && src.images.length) return src.images.map(img => ({ url: img, headers: this.getHeaders(img) }));
            } catch (_) {}
        }
        var list = [];
        for (var img of new Document(html).select("#readerarea img, .reader-area img")) {
            var imgSrc = (img.getSrc || img.attr("src") || img.attr("data-src") || "").trim();
            if (imgSrc && !imgSrc.includes("readerarea.svg")) list.push({ url: imgSrc, headers: this.getHeaders(imgSrc) });
        }
        return list;
    }
    getFilterList() {
        var opt = (n, v) => ({ type_name: "SelectOption", name: n, value: v }), cb = (n, v) => ({ type_name: "CheckBox", name: n, value: v, state: false });
        return [
            { type_name: "SelectFilter", name: "Order By", state: 0, values: [["Default",""],["Popularity","popular"],["Latest Update","update"],["Added Date","latest"],["A-Z","title"],["Z-A","titlereverse"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Status", state: 0, values: [["All",""],["Ongoing","ongoing"],["Completed","completed"],["Hiatus","hiatus"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Type", state: 0, values: [["All",""],["Manga","manga"],["Manhwa","manhwa"],["Manhua","manhua"],["Comic","comic"],["Novel","novel"]].map(x => opt(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Genres", state: [["ac","1257"],["Academy","228"],["Action","29"],["Adaptation","110"],["Adult","1234"],["Adventure","34"],["Ancient Style","182"],["Animals","928"],["Another World","1123"],["Apocalypse","222"],["Artifact","91"],["Based On A Novel","111"],["Battle","810"],["Battle Romance","1323"],["Blood","65"],["Bloody","80"],["brain hiole","97"],["Cheat system","124"],["Comedy","79"],["Conspiracy","217"],["Cooking","474"],["Crime","771"],["Cultivation","125"],["Dark Fantasy","1294"],["Delinquents","559"],["demons","207"],["Drama","30"],["Drama Seinen","466"],["Dungeon","210"],["Ecchi","57"],["Employee","983"],["excitement","120"],["Family Drama","1285"],["Fantasy","31"],["fantasy، Martial arts","183"],["Fighting","66"],["Finance","578"],["Full Color","981"],["Fusion","87"],["future era","69"],["Game","84"],["Gender Bender","192"],["Ghost","901"],["Gore","552"],["Growth","85"],["Harem","94"],["Historical","42"],["Horror","53"],["Hunter","696"],["hunters","178"],["Idols","653"],["Inspection","89"],["isekai","213"],["Josei","165"],["Joseon Dynasty","259"],["Kingdom Building","112"],["Long Strip","980"],["Magic","252"],["Manga","336"],["Manhua","326"],["Manhwa","265"],["Manhwa Hot","502"],["Martial Arts","32"],["Mature","167"],["Mecha","1297"],["Medical","399"],["Mercenary","1324"],["Middle-Aged","1132"],["Military","560"],["MMORPG","865"],["Modern Fantasy","1226"],["ModernFantasy","832"],["Monster","211"],["Monster girls","1142"],["Monsters","229"],["Munchkin","1108"],["Murim","258"],["Mystery","453"],["Necromancer","1113"],["Nobility","720"],["One shot","293"],["Overpowered","1178"],["Parenting","88"],["passionate","220"],["Pets","592"],["Player","86"],["Politics","547"],["power","1137"],["Powered Armor","90"],["Psychological","168"],["Psychology","868"],["Rebirth","194"],["Reborn","223"],["Regression","757"],["Reincarnation","561"],["Returner","1179"],["Revenge","328"],["Romance","128"],["Romantic Comedy","1363"],["school action","785"],["School Life","55"],["Sci-fi","58"],["Seinen","131"],["SF","698"],["Shoujo","163"],["Shoujo Ai","1159"],["Shounen","33"],["Si-fi","1301"],["Slice of Life","423"],["Sports","243"],["Summons","225"],["Supernatural","35"],["superpower","119"],["Survival","407"],["System","62"],["Tamer","308"],["Taming","216"],["Thriller","379"],["Thrilling","123"],["time travel","219"],["Tragedy","323"],["Unknown","508"],["Urban","1303"],["Video Games","1139"],["War","197"],["Weak-to-Strong","67"],["webtoon","1182"],["Webtoons","253"],["Work-Life","967"],["Xianxia","516"],["Yuri","1160"],["zombie","75"]].map(x => cb(x[0], x[1])) }
        ];
    }
};
