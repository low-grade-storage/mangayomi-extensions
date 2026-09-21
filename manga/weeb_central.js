const mangayomiSources = [{"id":693275080,"name":"Weeb Central","lang":"en","baseUrl":"https://weebcentral.com","apiUrl":"","iconUrl":"https://www.google.com/s2/favicons?sz=128&domain=https://weebcentral.com","typeSource":"single","itemType":0,"version":"0.1.1","pkgPath":"manga/src/en/weebcentral.js"}];

class DefaultExtension extends MProvider {
    constructor() { super(); this.client = new Client(); }
    getHeaders() { return { "Referer": `${this.source.baseUrl}/`, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }; }
    async request(slug) { return new Document((await this.client.get(slug.startsWith("http") ? slug : `${this.source.baseUrl}${slug}`, this.getHeaders())).body); }
    async getPopular(page) { const f = this.getFilterList(); f[0].state = 2; return this.search("", page, f); }
    async getLatestUpdates(page) { const f = this.getFilterList(); f[0].state = 5; return this.search("", page, f); }
    getImageUrl(id) { return `https://temp.compsci88.com/cover/normal/${id}.webp`; }
    async search(query, page, filters) {
        const offset = 32 * (Math.max(1, parseInt(page) || 1) - 1), af = (Array.isArray(filters) && filters.length > 0) ? filters : this.getFilterList();
        const sort = af?.[0]?.values?.[af[0]?.state]?.value ?? "Best Match", order = af?.[1]?.values?.[af[1]?.state]?.value ?? "Ascending", translation = af?.[2]?.values?.[af[2]?.state]?.value ?? "Any";
        const buildParams = (idx, param) => (Array.isArray(af?.[idx]?.state) ? af[idx].state.filter(f => f?.state === true && f?.value).map(f => `&${param}=${encodeURIComponent(f.value)}`).join("") : "");
        const slug = `/search/data?limit=32&offset=${offset}&author=&text=${encodeURIComponent((query || "").trim())}&sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}&official=${encodeURIComponent(translation)}${buildParams(3, "included_status")}${buildParams(4, "included_type")}${buildParams(5, "included_tag")}&display_mode=Full%20Display`;
        const doc = await this.request(slug), list = [];
        for (const manga of doc.select("article:has(section)")) {
            const img = manga.selectFirst("img"), d = manga.selectFirst("section > a"), nameEl = manga.selectFirst("article > div > div > div");
            const imageUrl = img ? (img.getSrc || img.attr("src") || "") : "", link = d ? (d.getHref || d.attr("href") || "") : "", name = nameEl ? nameEl.text.trim() : "";
            if (name && link) list.push({ name, imageUrl, link });
        }
        const btn = doc.selectFirst("button");
        return { list, hasNextPage: Boolean(btn && btn.text?.trim().length > 0) };
    }
    statusCode(s) { return { "Ongoing": 0, "Complete": 1, "Hiatus": 2, "Canceled": 3 }[s] ?? 5; }
    async getDetail(url) {
        const parts = url.split("/"), link = parts[parts.length - 2] || url, slug = url.startsWith("http") ? `/series/${link}` : `/series/${url}`;
        const doc = await this.request(slug), imageUrl = this.getImageUrl(url.startsWith("http") ? link : url);
        const description = doc.selectFirst("p.whitespace-pre-wrap.break-words")?.text.trim() || "";
        let author = "", genre = [], status = 5;
        for (const li of doc.select("ul.flex.flex-col.gap-4 > li")) {
            const txt = li.selectFirst("strong")?.text || "";
            if (txt.includes("Author(s):")) author = li.selectFirst("a")?.text.trim() || "";
            else if (txt.includes("Tags(s):") || txt.includes("Tag(s):")) li.select("a").forEach(a => { const t = a.text.trim(); if (t) genre.push(t); });
            else if (txt.includes("Status:")) status = this.statusCode(li.selectFirst("a")?.text.trim() || "");
        }
        const chapDoc = await this.request(`${slug}/full-chapter-list`), chapters = [];
        for (const chap of chapDoc.select("div.flex.items-center")) {
            const name = chap.selectFirst("span.grow.flex.items-center.gap-2")?.selectFirst("span")?.text.trim() || "Chapter";
            const timeEl = chap.selectFirst("time.text-datetime"), dateUpload = timeEl ? new Date(timeEl.text.trim()).valueOf().toString() : "";
            const chapUrl = chap.selectFirst("input")?.attr("value");
            if (chapUrl) chapters.push({ name, url: chapUrl, dateUpload });
        }
        return { description, imageUrl, author, genre, status, chapters };
    }
    async getPageList(url) {
        const doc = await this.request(`/chapters/${url}/images?current_page=1&reading_style=long_strip`), urls = [];
        doc.select("section > img").forEach(p => { const src = p.attr("src"); if (src) urls.push(src); });
        return urls.map(x => ({ url: x, headers: { Referer: `${this.source.baseUrl}/`, Accept: "image/avif,image/webp,*/*", Host: x.match(/^(?:https?:\/\/)?([^\/:]+)(:\d+)?/)?.[1] || "weebcentral.com" } }));
    }
    getFilterList() {
        const opt = (n, v) => ({ type_name: 'SelectOption', name: n, value: v }), cb = (n, v) => ({ type_name: 'CheckBox', name: n, value: v });
        return [
            { type_name: "SelectFilter", name: "Sort", state: 0, values: [["Best Match","Best Match"],["Alphabet","Alphabet"],["Popularity","Popularity"],["Subscribers","Subscribers"],["Recently Added","Recently Added"],["Latest Updates","Latest Updates"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Order", state: 0, values: [["Ascending","Ascending"],["Descending","Descending"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Official Translation", state: 0, values: [["Any","Any"],["True","True"],["False","False"]].map(x => opt(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Series Status", state: [["Ongoing","Ongoing"],["Complete","Complete"],["Hiatus","Hiatus"],["Canceled","Canceled"]].map(x => cb(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Series Type", state: [["Manga","Manga"],["Manhwa","Manhwa"],["Manhua","Manhua"],["OEL","OEL"]].map(x => cb(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Tags", state: ["Action","Adventure","Adult","Comedy","Doujinshi","Drama","Ecchi","Fantasy","Gender Bender","Harem","Hentai","Historical","Horror","Isekai","Josei","Lolicon","Martial Arts","Mature","Mecha","Mystery","Psychological","Romance","School Life","Sci-Fi","Seinen","Shotacon","Shoujo","Shoujo Ai","Shounen","Slice of Life","Smut","Sports","Supernatural","Tragedy","Yaoi","Yuri","Other"].map(x => cb(x, x)) }
        ];
    }
    getSourcePreferences() { return []; }
}
