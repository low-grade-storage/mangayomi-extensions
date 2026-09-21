const mangayomiSources = [{"id":371842104,"name":"Atsumaru","lang":"en","baseUrl":"https://atsu.moe","apiUrl":"https://atsu.moe","iconUrl":"https://atsu.moe/favicon.ico","typeSource":"single","itemType":0,"isManga":true,"isNsfw":false,"version":"0.0.1","dateFormat":"","dateFormatLocale":"","pkgPath":"manga/src/en/atsumaru.js"}];

class DefaultExtension extends MProvider {
    constructor() { super(); this.client = new Client(); this.cdnBase = "https://cdn.atsu.moe"; }
    getHeaders() { return { "Referer": "https://atsu.moe/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }; }
    get supportsLatest() { return true; }
    _getPreference(k, d) { try { const v = new SharedPreferences().get(k); if (v !== null && v !== undefined && v !== "") return v; } catch (_) {} return d; }
    _resolveUrl(p) {
        if (!p) return "";
        const c = String(p).trim().replace(/\.avif$/i, ".webp");
        return /^https?:\/\//i.test(c) ? c : c.startsWith("/static/") ? `${this.cdnBase}${c}` : c.startsWith("static/") ? `${this.cdnBase}/${c}` : c.startsWith("/") ? `${this.cdnBase}/static${c}` : `${this.cdnBase}/static/${c}`;
    }
    _resolveCover(item) {
        if (!item) return "";
        if (typeof item === "string") return this._resolveUrl(item);
        const q = this._getPreference("cover_quality", "medium"), po = (item.poster && typeof item.poster === "object") ? item.poster : null;
        const s = (po && (po.smallImage || po.posterSmall)) || item.posterSmall || item.smallImage;
        const m = (po && (po.mediumImage || po.posterMedium)) || item.posterMedium || item.mediumImage;
        const l = (po && (po.largeImage || po.posterLarge)) || item.largeImage;
        const raw = (po && (po.image || po.id || po.poster)) || (typeof item.poster === "string" ? item.poster : null) || item.image;
        let cand = q === "small" ? (s || m || raw || l) : q === "large" ? (l || m || raw || s) : (m || s || raw || l);
        if (cand && typeof cand === "object") cand = cand.mediumImage || cand.smallImage || cand.image || cand.largeImage || cand.id || "";
        return this._resolveUrl(cand);
    }
    _resolvePageUrl(p) { return !p ? "" : /^https?:\/\//i.test(p) ? p : p.startsWith("/static/") ? `${this.cdnBase}${p}` : p.startsWith("static/") ? `${this.cdnBase}/${p}` : p.startsWith("/") ? `${this.cdnBase}/static${p}` : `${this.cdnBase}/static/${p}`; }
    _getId(url) {
        const parts = String(url || "").trim().split("?")[0].split("#")[0].split("/").filter(Boolean);
        const mi = parts.indexOf("manga"), ri = parts.indexOf("read");
        return mi !== -1 && mi + 1 < parts.length ? parts[mi + 1] : ri !== -1 && ri + 1 < parts.length ? parts[ri + 1] : parts[parts.length - 1] || url;
    }
    _parseChapterUrl(url) {
        const parts = String(url || "").trim().split("?")[0].split("#")[0].split("/").filter(Boolean), ri = parts.indexOf("read");
        return ri !== -1 && ri + 2 < parts.length ? { mangaId: parts[ri + 1], chapterId: parts[ri + 2] } : parts.length >= 2 ? { mangaId: parts[parts.length - 2], chapterId: parts[parts.length - 1] } : { mangaId: "", chapterId: url };
    }
    _cleanText(str) { return !str ? "" : String(str).replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
    _buildQuery(params) { return Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== "").map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join("&"); }
    async getPopular(page) {
        const json = JSON.parse((await this.client.get(`${this.source.apiUrl}/api/home2/popular?offset=${(Math.max(1, parseInt(page) || 1) - 1) * 20}`, this.getHeaders())).body), items = json.items || [];
        return { list: items.slice(0, 20).map(i => ({ name: i.title || "Untitled", imageUrl: this._resolveCover(i), link: `/manga/${i.id}` })), hasNextPage: items.length > 0 };
    }
    async getLatestUpdates(page) {
        const json = JSON.parse((await this.client.get(`${this.source.apiUrl}/api/home2/recentlyUpdated?offset=${(Math.max(1, parseInt(page) || 1) - 1) * 20}`, this.getHeaders())).body), items = json.items || [];
        return { list: items.slice(0, 20).map(i => ({ name: i.title || "Untitled", imageUrl: this._resolveCover(i), link: `/manga/${i.id}` })), hasNextPage: items.length > 0 };
    }
    async search(query, page, filters) {
        const q = String(query || "").trim(), p = Math.max(1, parseInt(page) || 1), perPage = 20;
        let sortBy = "views:desc", typeVal = "", statusVal = "", incG = [], excG = [];
        if (Array.isArray(filters)) {
            for (const f of filters) {
                if (!f) continue;
                const tn = f.type_name || f.name;
                if (tn === "SortFilter" || f.name === "Sort") {
                    const idx = (typeof f.state === "object" && f.state !== null) ? f.state.index : (parseInt(f.state) || 0);
                    if (f.values?.[idx]) sortBy = f.values[idx].value || sortBy;
                } else if (tn === "SelectFilter" && f.name === "Type") typeVal = f.values?.[parseInt(f.state) || 0]?.value || "";
                else if (tn === "SelectFilter" && f.name === "Status") statusVal = f.values?.[parseInt(f.state) || 0]?.value || "";
                else if (tn === "GroupFilter" && f.name === "Genres") for (const i of (f.state || [])) { if (i.state === 1) incG.push(i.value); else if (i.state === 2) excG.push(i.value); }
            }
        }
        const rules = ["hidden:!=true", "medium:=Comic"];
        if (!this._getPreference("include_adult", false) && !incG.includes("46") && !incG.includes("10")) rules.push("isAdult:=false");
        if (typeVal) rules.push(`type:=${typeVal}`);
        if (statusVal) rules.push(`status:=${statusVal}`);
        if (incG.length) rules.push(`genreIds:=[${incG.join(",")}]`);
        if (excG.length) rules.push(`genreIds:!=[${excG.join(",")}]`);
        const params = { q: q || "*", query_by: "title,englishTitle,otherNames,authors,acronyms", query_by_weights: "4,3,2,2,1", num_typos: "4,3,2,1,0", prefix: "true,true,true,true,false", include_fields: "id,title,englishTitle,authors,poster,posterSmall,posterMedium,type,medium,isAdult,status,year,mbRating,popularity,dateAdded", page: String(p), per_page: String(perPage), filter_by: rules.join(" && ") };
        if (q) params.infix = "off,off,fallback,off,off"; else params.sort_by = sortBy;
        const json = JSON.parse((await this.client.get(`${this.source.apiUrl}/collections/manga/documents/search?${this._buildQuery(params)}`, this.getHeaders())).body), hits = json.hits || [];
        return { list: hits.map(h => ({ name: h.document?.title || h.document?.englishTitle || "Untitled", imageUrl: this._resolveCover(h.document || {}), link: `/manga/${h.document?.id}` })), hasNextPage: ((p - 1) * perPage + hits.length) < (json.found || 0) };
    }
    async getDetail(url) {
        const mangaId = this._getId(url), json = JSON.parse((await this.client.get(`${this.source.apiUrl}/api/manga/page?id=${mangaId}`, this.getHeaders())).body), m = json.mangaPage || {};
        const authorList = [], artistList = [];
        for (const a of (m.authors || [])) (a.type === "Artist" ? artistList : authorList).push(a.name);
        const author = authorList.join(", ") || (m.authors || []).map(a => a.name).join(", "), artist = artistList.join(", ") || author;
        const status = m.status === "Ongoing" ? 0 : m.status === "Completed" ? 1 : m.status === "Hiatus" ? 2 : m.status === "Canceled" ? 3 : m.status === "Publishing Finished" ? 4 : 5;
        const genre = [];
        for (const g of (m.genres || [])) if (g.name && !genre.includes(g.name)) genre.push(g.name);
        for (const t of (m.tags || [])) if (t.name && !genre.includes(t.name) && genre.length < 15) genre.push(t.name);
        const scanMap = {}, scanScores = {};
        for (const s of (m.scanlators || [])) { scanMap[s.id] = s.name; scanScores[s.id] = s.score ?? 0; }
        let rawChapters = m.chapters || [];
        if (m.hasMoreChapters) {
            try {
                const cj = JSON.parse((await this.client.get(`${this.source.apiUrl}/api/manga/allChapters?mangaId=${mangaId}`, this.getHeaders())).body);
                if (Array.isArray(cj)) rawChapters = cj; else if (Array.isArray(cj.chapters) && cj.chapters.length) rawChapters = cj.chapters;
            } catch (_) {}
        }
        const scanPref = this._getPreference("scanlator_filter", "most_chapters"), prefScan = String(this._getPreference("preferred_scanlator", "")).trim();
        const scanStats = {};
        for (const ch of rawChapters) {
            const sid = ch.scanlationMangaId || "unknown";
            if (!scanStats[sid]) scanStats[sid] = { id: sid, name: scanMap[sid] || "Unknown", count: 0, score: scanScores[sid] ?? 0, maxChapter: -1, latestDate: 0, totalPages: 0 };
            scanStats[sid].count += 1;
            const num = ch.number != null ? Number(ch.number) : -1; if (num > scanStats[sid].maxChapter) scanStats[sid].maxChapter = num;
            const d = ch.createdAt ? Number(ch.createdAt) : 0; if (d > scanStats[sid].latestDate) scanStats[sid].latestDate = d;
            scanStats[sid].totalPages += (ch.pageCount || 0);
        }
        let processed = [];
        if (Object.keys(scanStats).length <= 1 || scanPref === "all") processed = rawChapters.slice();
        else if (scanPref === "smart_dedup") {
            const byNum = new Map();
            for (const ch of rawChapters) {
                const k = ch.number != null ? String(Number(ch.number)) : `id_${ch.id}`, score = (scanScores[ch.scanlationMangaId || "unknown"] ?? 0) * 1000 + (ch.pageCount || 0);
                if (!byNum.has(k) || score > byNum.get(k).score) byNum.set(k, { ch, score });
            }
            processed = Array.from(byNum.values()).map(v => v.ch);
        } else {
            let chosen = prefScan ? Object.values(scanStats).find(s => s.name.toLowerCase().includes(prefScan.toLowerCase()))?.id : null;
            if (!chosen) {
                const sorted = Object.values(scanStats).sort((a, b) => scanPref === "highest_rating" ? (b.score - a.score || b.count - a.count || b.maxChapter - a.maxChapter || b.latestDate - a.latestDate) : (b.count - a.count || b.score - a.score || b.maxChapter - a.maxChapter || b.latestDate - a.latestDate));
                if (sorted.length) chosen = sorted[0].id;
            }
            processed = chosen ? rawChapters.filter(ch => (ch.scanlationMangaId ? ch.scanlationMangaId === chosen : true)) : rawChapters.slice();
        }
        processed.sort((a, b) => (Number(b.number ?? 0) - Number(a.number ?? 0)) || (Number(b.index ?? 0) - Number(a.index ?? 0)) || (Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)));
        const chapters = processed.map(ch => {
            const sn = scanMap[ch.scanlationMangaId] || "";
            let name = (ch.title || "").trim() || (ch.number != null ? `Chapter ${ch.number}` : "Chapter");
            if (scanPref === "all" && sn) name += ` [${sn}]`;
            return { name, url: `/read/${mangaId}/${ch.id}`, dateUpload: ch.createdAt ? String(ch.createdAt) : "", scanlator: sn };
        });
        return { name: m.title || m.englishTitle || "Untitled", imageUrl: this._resolveCover(m), description: this._cleanText(m.synopsis), genre, status, author, artist, chapters, episodes: chapters };
    }
    async getPageList(url) {
        const { mangaId, chapterId } = this._parseChapterUrl(url);
        if (!mangaId || !chapterId) throw new Error(`Invalid chapter URL: ${url}`);
        const j = JSON.parse((await this.client.get(`${this.source.apiUrl}/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`, this.getHeaders())).body);
        return (j.readChapter?.pages || []).map(p => ({ url: this._resolvePageUrl(p.image), headers: this.getHeaders() }));
    }
    getFilterList() {
        const opt = (n, v) => ({ type_name: "SelectOption", name: n, value: v }), tri = (n, v) => ({ type_name: "TriState", name: n, value: v });
        return [
            { type_name: "SortFilter", name: "Sort", state: { index: 0, ascending: false }, values: [opt("Most Popular","views:desc"), opt("Latest Added","dateAdded:desc"), opt("Highest Rated","mbRating:desc"), opt("Title (A-Z)","title:asc"), opt("Release Year","releaseYear:desc")] },
            { type_name: "SelectFilter", name: "Type", state: 0, values: [["All Types",""],["Manga","Manga"],["Manhwa","Manwha"],["Manhua","Manhua"],["OEL","OEL"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Status", state: 0, values: [["All Statuses",""],["Ongoing","Ongoing"],["Completed","Completed"],["Hiatus","Hiatus"],["Canceled","Canceled"]].map(x => opt(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Genres", state: [["Action","39"],["Adventure","37"],["Boys Love","180"],["Comedy","6"],["Drama","31"],["Fantasy","36"],["Girls Love","4"],["Historical","45"],["Horror","44"],["Martial Arts","29"],["Mystery","32"],["Psychological","18"],["Romance","9"],["Sci-Fi","1"],["Slice of Life","7"],["Supernatural","22"],["Thriller","19"],["Tragedy","5"],["Adult","46"],["Hentai","10"],["Smut","41"]].map(x => tri(x[0], x[1])) }
        ];
    }
    getSourcePreferences() {
        return [
            { key: "cover_quality", listPreference: { title: "Cover Image Quality", summary: "Select image quality for manga covers to balance loading speed and clarity", valueIndex: 1, entries: ["Low / Small (Fastest)", "Medium (Balanced, Recommended)", "Original / Large (High Quality)"], entryValues: ["small", "medium", "large"] } },
            { key: "scanlator_filter", listPreference: { title: "Scanlator Chapter Filter", summary: "Filter chapter releases to eliminate duplicates across multiple scanlation groups", valueIndex: 0, entries: ["Scanlator with Most Chapters (Single Scanlator, Deduplicated)", "Highest-Rated Scanlator (Single Scanlator by Rating)", "Smart Deduplication (1 Chapter per Number, Best Quality)", "All Scanlators (Show all releases, Duplicates allowed)"], entryValues: ["most_chapters", "highest_rating", "smart_dedup", "all"] } },
            { key: "preferred_scanlator", editTextPreference: { title: "Preferred Scanlator (Optional)", summary: "Prioritize this scanlator if available (e.g. Asura, Alpha, Flame). If empty or not found, falls back to the scanlator with the most chapters.", value: "", dialogTitle: "Preferred Scanlator", dialogMessage: "Enter scanlator name to prioritize (case-insensitive, leave blank for automatic selection by chapter count):" } },
            { key: "include_adult", switchPreferenceCompat: { title: "Include Adult / 18+ Content", summary: "Show mature and adult titles in explore and search", value: false } }
        ];
    }
}
