const mangayomiSources = [{"id":810342358,"name":"MangaDex","lang":"en","baseUrl":"https://mangadex.org","apiUrl":"https://api.mangadex.org","iconUrl":"https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/javascript/icon/all.mangadex.png","typeSource":"single","itemType":0,"isManga":true,"version":"0.1.5","dateFormat":"","dateFormatLocale":"","pkgPath":"manga/src/en/mangadex.js"}];

class DefaultExtension extends MProvider {
    constructor() { super(); this.client = new Client(); }
    getHeaders() { return { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Referer": "https://mangadex.org/" }; }
    findTitle(m) {
        const a = m?.attributes || {}, t = a.title || {};
        if (t.en) return t.en;
        const tk = Object.keys(t);
        if (tk.length) return t[tk[0]];
        for (const alt of (a.altTitles || [])) { if (alt.en) return alt.en; }
        const fa = (a.altTitles || [])[0];
        return (fa && Object.keys(fa).length) ? fa[Object.keys(fa)[0]] : "Untitled";
    }
    getCoverUrl(m) {
        const fn = (m?.relationships || []).find(r => r.type === "cover_art")?.attributes?.fileName;
        return fn ? `https://uploads.mangadex.org/covers/${m?.id}/${fn}.512.jpg` : "";
    }
    async getPopular(page) {
        const offset = 20 * (Math.max(1, parseInt(page) || 1) - 1);
        const res = await this.client.get(`${this.source.apiUrl}/manga?limit=20&offset=${offset}&availableTranslatedLanguage[]=en&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`, this.getHeaders());
        const json = JSON.parse(res.body);
        return { list: (json.data || []).map(i => ({ name: this.findTitle(i), imageUrl: this.getCoverUrl(i), link: `/manga/${i.id}` })), hasNextPage: offset + 20 < (json.total || 0) };
    }
    async getLatestUpdates(page) {
        const offset = 20 * (Math.max(1, parseInt(page) || 1) - 1);
        const chRes = await this.client.get(`${this.source.apiUrl}/chapter?limit=20&offset=${offset}&translatedLanguage[]=en&order[publishAt]=desc&includeFutureUpdates=0&includeFuturePublishAt=0&includeEmptyPages=0&includeExternalUrl=0`, this.getHeaders());
        const mangaIds = Array.from(new Set((JSON.parse(chRes.body).data || []).flatMap(c => c.relationships || []).filter(r => r.type === "manga").map(r => r.id)));
        if (!mangaIds.length) return { list: [], hasNextPage: false };
        const mRes = await this.client.get(`${this.source.apiUrl}/manga?includes[]=cover_art&limit=${mangaIds.length}&contentRating[]=safe&contentRating[]=suggestive${mangaIds.map(id => `&ids[]=${id}`).join("")}`, this.getHeaders());
        return { list: (JSON.parse(mRes.body).data || []).map(i => ({ name: this.findTitle(i), imageUrl: this.getCoverUrl(i), link: `/manga/${i.id}` })), hasNextPage: true };
    }
    async search(query, page) {
        const q = (query || "").trim(), offset = 20 * (Math.max(1, parseInt(page) || 1) - 1);
        const url = `${this.source.apiUrl}/manga?includes[]=cover_art&offset=${offset}&limit=20&availableTranslatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive${q ? `&title=${encodeURIComponent(q)}` : "&order[followedCount]=desc"}`;
        const json = JSON.parse((await this.client.get(url, this.getHeaders())).body);
        return { list: (json.data || []).map(i => ({ name: this.findTitle(i), imageUrl: this.getCoverUrl(i), link: `/manga/${i.id}` })), hasNextPage: offset + 20 < (json.total || 0) };
    }
    async getDetail(url) {
        const clean = url.replace("https://mangadex.org/title/", "").replace("/manga/", "").split("/")[0].split("?")[0];
        const json = JSON.parse((await this.client.get(`${this.source.apiUrl}/manga/${clean}?includes[]=cover_art&includes[]=author&includes[]=artist`, this.getHeaders())).body);
        const d = json.data, a = d?.attributes || {};
        const author = (d?.relationships || []).filter(r => r.type === "author" || r.type === "artist").map(r => r.attributes?.name).filter(Boolean).join(", ");
        const genre = (a.tags || []).map(t => t.attributes?.name?.en).filter(Boolean);
        const status = a.status === "completed" ? 1 : a.status === "hiatus" ? 2 : a.status === "cancelled" ? 3 : 0;
        let offset = 0, langFilter = "translatedLanguage[]=en&", chapters = [];
        let feedUrl = `${this.source.apiUrl}/manga/${clean}/feed?limit=100&offset=0&${langFilter}order[chapter]=desc&includeFuturePublishAt=0&includeEmptyPages=0&includeExternalUrl=0`;
        let feedJson = JSON.parse((await this.client.get(feedUrl, this.getHeaders())).body);
        if (!feedJson.data?.length) {
            langFilter = "";
            feedJson = JSON.parse((await this.client.get(`${this.source.apiUrl}/manga/${clean}/feed?limit=100&offset=0&order[chapter]=desc&includeFuturePublishAt=0&includeEmptyPages=0&includeExternalUrl=0`, this.getHeaders())).body);
        }
        let total = feedJson.total || 0, items = feedJson.data || [];
        while (items.length > 0) {
            for (const item of items) {
                const ca = item.attributes || {};
                if (ca.externalUrl) continue;
                let chapName = `${ca.volume ? `Vol.${ca.volume} ` : ""}${ca.chapter ? `Ch.${ca.chapter} ` : ""}${ca.title || ""}`.trim() || "Chapter";
                if (ca.translatedLanguage && ca.translatedLanguage !== "en") chapName += ` [${ca.translatedLanguage}]`;
                chapters.push({ name: chapName.trim(), url: item.id, dateUpload: ca.publishAt ? new Date(ca.publishAt).valueOf().toString() : Date.now().toString() });
            }
            offset += 100;
            if (offset >= total || offset >= 500) break;
            items = JSON.parse((await this.client.get(`${this.source.apiUrl}/manga/${clean}/feed?limit=100&offset=${offset}&${langFilter}order[chapter]=desc&includeFuturePublishAt=0&includeEmptyPages=0&includeExternalUrl=0`, this.getHeaders())).body).data || [];
        }
        return { name: this.findTitle(d), imageUrl: this.getCoverUrl(d), description: (a.description?.en || a.description?.["en-us"] || Object.values(a.description || {})[0] || "").trim(), genre, status, author, chapters, episodes: chapters };
    }
    async getPageList(url) {
        const id = url.replace("https://mangadex.org/chapter/", "").replace("/chapter/", "").split("/")[0].split("?")[0];
        const j = JSON.parse((await this.client.get(`${this.source.apiUrl}/at-home/server/${id}`, this.getHeaders())).body);
        return (j.chapter?.data || []).map(f => ({ url: `${j.baseUrl}/data/${j.chapter?.hash}/${f}`, headers: this.getHeaders() }));
    }
    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
