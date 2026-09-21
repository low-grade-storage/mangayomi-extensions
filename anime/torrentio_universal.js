const mangayomiSources = [{"id":715754020,"name":"Torrentio Universal (Movies / TV / Anime)","lang":"all","baseUrl":"https://torrentio.strem.fun","apiUrl":"https://v3-cinemeta.strem.io","iconUrl":"https://torrentio.strem.fun/images/logo_v1.png","typeSource":"torrent","isManga":false,"itemType":1,"version":"0.1.0","pkgPath":"anime/src/all/torrentio_universal.js","notes":"Universal streaming extension for Movies, TV Series, and Anime powered by Cinemeta catalog and Torrentio torrent/debrid streams."}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.cinemetaBase = "https://v3-cinemeta.strem.io";
        this.trackers = ["udp://tracker.opentrackr.org:1337/announce","udp://open.stealth.si:80/announce","udp://tracker.torrent.eu.org:451/announce","udp://open.demonii.com:1337/announce","udp://tracker.qu.ax:6969/announce","udp://exodus.desync.com:6969/announce","udp://tracker.nyaa.vc:6969/announce","udp://tracker.tryhackx.org:6969/announce","udp://tracker.gmi.gd:6969/announce","udp://tracker.ducks.party:1984/announce","udp://tracker.corpscorp.online:80/announce","udp://explodie.org:6969/announce","udp://tracker.bittor.pw:1337/announce","udp://tracker-udp.gbitt.info:80/announce","udp://retracker01-msk-virt.corbina.net:80/announce","udp://tracker.0x7c0.com:6969/announce","udp://tracker.dler.org:6969/announce","http://tracker.renfei.net:8080/announce","udp://tracker2.dler.org:80/announce","http://tracker.dler.com:6969/announce","udp://opentor.net:6969","udp://tracker.openbittorrent.com:6969/announce","udp://tracker.tiny-vps.com:6969/announce"];
    }
    getHeaders() { return { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json, text/plain, */*" }; }
    _interleave(movies, series) {
        const list = [], maxLen = Math.max(movies.length, series.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < movies.length) list.push({ name: `${movies[i].name || "Movie"}${movies[i].releaseInfo ? ` (${movies[i].releaseInfo})` : ""}`, imageUrl: movies[i].poster || movies[i].background || "", link: `movie/${movies[i].id}` });
            if (i < series.length) list.push({ name: `${series[i].name || "Series"}${series[i].releaseInfo ? ` (${series[i].releaseInfo})` : ""}`, imageUrl: series[i].poster || series[i].background || "", link: `series/${series[i].id}` });
        }
        return list;
    }
    async _fetchMetas(mUrl, sUrl) {
        let m = [], s = [];
        try { m = JSON.parse((await this.client.get(mUrl, this.getHeaders())).body)?.metas || []; } catch (_) {}
        try { s = JSON.parse((await this.client.get(sUrl, this.getHeaders())).body)?.metas || []; } catch (_) {}
        const list = this._interleave(m, s);
        return { list, hasNextPage: list.length > 0 };
    }
    async getPopular(page) {
        const skip = (Math.max(1, parseInt(page) || 1) - 1) * 20;
        return this._fetchMetas(`${this.cinemetaBase}/catalog/movie/top/skip=${skip}.json`, `${this.cinemetaBase}/catalog/series/top/skip=${skip}.json`);
    }
    async getLatestUpdates(page) {
        const skip = (Math.max(1, parseInt(page) || 1) - 1) * 20;
        return this._fetchMetas(`${this.cinemetaBase}/catalog/movie/imdbRating/skip=${skip}.json`, `${this.cinemetaBase}/catalog/series/imdbRating/skip=${skip}.json`);
    }
    async search(query, page, filters) {
        const q = (query || "").trim();
        if (q.startsWith("tt") && /^tt\d+$/.test(q)) {
            const d = await this.getDetail(`movie/${q}`);
            return { list: [{ name: d.name || q, imageUrl: d.imageUrl || "", link: `movie/${q}` }], hasNextPage: false };
        }
        let typeFilter = "all", genreFilter = "";
        if (Array.isArray(filters)) {
            for (const f of filters) {
                if (f?.type_name === "SelectFilter") {
                    const sel = f.values?.[f.state], val = Array.isArray(sel) ? sel[1] : (sel?.value ?? sel);
                    if (f.name === "Type" && val) typeFilter = val;
                    else if (f.name === "Genre" && val) genreFilter = val;
                }
            }
        }
        const eq = encodeURIComponent(q);
        let mm = [], sm = [];
        if (typeFilter === "all" || typeFilter === "movie") {
            try {
                let u = q ? `${this.cinemetaBase}/catalog/movie/top/search=${eq}.json` : `${this.cinemetaBase}/catalog/movie/top.json`;
                if (genreFilter && !q) u = `${this.cinemetaBase}/catalog/movie/top/genre=${encodeURIComponent(genreFilter)}.json`;
                mm = JSON.parse((await this.client.get(u, this.getHeaders())).body)?.metas || [];
            } catch (_) {}
        }
        if (typeFilter === "all" || typeFilter === "series") {
            try {
                let u = q ? `${this.cinemetaBase}/catalog/series/top/search=${eq}.json` : `${this.cinemetaBase}/catalog/series/top.json`;
                if (genreFilter && !q) u = `${this.cinemetaBase}/catalog/series/top/genre=${encodeURIComponent(genreFilter)}.json`;
                sm = JSON.parse((await this.client.get(u, this.getHeaders())).body)?.metas || [];
            } catch (_) {}
        }
        const list = [], seen = new Set(), maxLen = Math.max(mm.length, sm.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < mm.length && mm[i]?.id && !seen.has(mm[i].id)) { seen.add(mm[i].id); list.push({ name: `${mm[i].name || "Movie"}${mm[i].releaseInfo ? ` (${mm[i].releaseInfo})` : ""}`, imageUrl: mm[i].poster || mm[i].background || "", link: `movie/${mm[i].id}` }); }
            if (i < sm.length && sm[i]?.id && !seen.has(sm[i].id)) { seen.add(sm[i].id); list.push({ name: `${sm[i].name || "Series"}${sm[i].releaseInfo ? ` (${sm[i].releaseInfo})` : ""}`, imageUrl: sm[i].poster || sm[i].background || "", link: `series/${sm[i].id}` }); }
        }
        return { list, hasNextPage: false };
    }
    async getDetail(url) {
        let type = "movie", id = url;
        if (url.includes("/")) [type, id] = url.split("/");
        let meta = null;
        try { meta = JSON.parse((await this.client.get(`${this.cinemetaBase}/meta/${type}/${id}.json`, this.getHeaders())).body)?.meta; } catch (_) {}
        if (!meta && type === "movie") {
            try {
                meta = JSON.parse((await this.client.get(`${this.cinemetaBase}/meta/series/${id}.json`, this.getHeaders())).body)?.meta;
                if (meta) type = "series";
            } catch (_) {}
        }
        const details = [];
        if (meta?.releaseInfo || meta?.year) details.push(`Year: ${meta.releaseInfo || meta.year}`);
        if (meta?.runtime) details.push(`Runtime: ${meta.runtime}`);
        if (meta?.imdbRating) details.push(`IMDb Rating: ⭐ ${meta.imdbRating}`);
        if (meta?.genres?.length) details.push(`Genres: ${meta.genres.join(", ")}`);
        if (meta?.director?.length) details.push(`Director: ${meta.director.join(", ")}`);
        if (meta?.writer?.length) details.push(`Writers: ${meta.writer.join(", ")}`);
        if (meta?.cast?.length) details.push(`Cast: ${meta.cast.slice(0, 5).join(", ")}`);
        const desc = (details.length ? `${details.join("\n")}\n\n${meta?.description || ""}` : meta?.description || "").trim();
        const author = meta?.director?.join(", ") || meta?.writer?.join(", ") || (meta?.cast ? meta.cast[0] : "");
        let episodes = [];
        if (type === "movie") {
            episodes = [{ name: `Play Movie (${meta?.name || "Full Movie"})`, url: `/stream/movie/${id}.json`, dateUpload: meta?.released ? new Date(meta.released).getTime().toString() : "" }];
        } else if (type === "series" && Array.isArray(meta?.videos) && meta.videos.length > 0) {
            episodes = meta.videos.slice().sort((a, b) => ((a.season || 1) - (b.season || 1)) || ((a.episode || a.number || 1) - (b.episode || b.number || 1))).map(v => ({
                name: `S${v.season ?? 1} E${v.episode ?? v.number ?? 1}${v.name || v.title ? " : " + (v.name || v.title) : ""}`,
                url: `/stream/series/${v.id || `${id}:${v.season ?? 1}:${v.episode ?? v.number ?? 1}`}.json`,
                dateUpload: v.released || v.firstAired ? new Date(v.released || v.firstAired).getTime().toString() : ""
            }));
        } else {
            episodes = [{ name: `Play (${meta?.name || id})`, url: `/stream/${type}/${id}.json`, dateUpload: "" }];
        }
        return { name: meta?.name || id, imageUrl: meta?.poster || meta?.background || "", description: desc, author, genre: meta?.genres || (meta?.genre ? [meta.genre] : ["Media"]), status: type === "movie" ? 1 : (meta?.status === "Ended" ? 1 : 0), episodes };
    }
    appendQueryParam(k, v) {
        if (!v) return "";
        const f = (Array.isArray(v) ? v : (v instanceof Set ? Array.from(v) : [v])).filter(x => typeof x === "string" && x.trim() !== "");
        return f.length ? `${k}=${f.join(",")}|` : "";
    }
    async getVideoList(url) {
        const prefs = new SharedPreferences(), dp = prefs.get("debrid_provider_1") || "none", token = (prefs.get("token_1") || "").trim();
        if (dp !== "none" && !token) throw new Error("Kindly input your Debrid API token in Extension Settings.");
        let mainURL = `${this.source.baseUrl}/` + this.appendQueryParam("providers", prefs.get("provider_selection_1")) + this.appendQueryParam("qualityfilter", prefs.get("quality_selection")) + this.appendQueryParam("sort", prefs.get("sorting_link_1")) + (dp !== "none" ? `${dp}=${token}|` : "") + (url.startsWith("/") ? url.slice(1) : url);
        mainURL = mainURL.replace(/\|$/, "");
        const streams = JSON.parse((await this.client.get(mainURL, this.getHeaders())).body)?.streams || [];
        const tr = this.trackers.map(t => `&tr=${encodeURIComponent(t)}`).join("");
        let videos = streams.map(s => {
            const isDebrid = dp !== "none" && Boolean(s.url);
            let videoUrl = isDebrid ? s.url : s.infoHash ? `magnet:?xt=urn:btih:${s.infoHash}&dn=${encodeURIComponent(s.behaviorHints?.filename || s.title || s.infoHash)}${tr}${s.fileIdx != null ? `&index=${s.fileIdx}` : ""}` : (s.url || "");
            const h = (s.name || "Torrentio").replace("Torrentio\n", "").replace("\n", " "), dt = (s.title || "").replace(/[\r\n]+/g, " • ");
            return { url: videoUrl, originalUrl: videoUrl, quality: `${h} • ${dt}`.trim() };
        }).filter(v => Boolean(v.url));
        const maxLinks = prefs.get("number_of_links_1");
        if (maxLinks && maxLinks !== "all") { const lim = parseInt(maxLinks); if (!isNaN(lim) && lim > 0) videos = videos.slice(0, lim); }
        return videos;
    }
    getFilterList() {
        const opt = (n, v) => ({ type_name: "SelectOption", name: n, value: v });
        return [
            { type_name: "SelectFilter", name: "Type", state: 0, values: [["All (Movies & Series)", "all"], ["Movies Only", "movie"], ["Series Only", "series"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Genre", state: 0, values: [["All Genres",""],["Action","Action"],["Adventure","Adventure"],["Animation","Animation"],["Comedy","Comedy"],["Crime","Crime"],["Documentary","Documentary"],["Drama","Drama"],["Family","Family"],["Fantasy","Fantasy"],["History","History"],["Horror","Horror"],["Mystery","Mystery"],["Romance","Romance"],["Sci-Fi","Sci-Fi"],["Sport","Sport"],["Thriller","Thriller"],["War","War"],["Western","Western"]].map(x => opt(x[0], x[1])) }
        ];
    }
    getSourcePreferences() {
        return [
            { key: "debrid_provider_1", listPreference: { title: "Debrid Provider", summary: "Select 'None' for P2P BitTorrent streams, or choose your Debrid provider for direct HTTP streams.", valueIndex: 0, entries: ["None (P2P Torrent)","RealDebrid","Premiumize","AllDebrid","DebridLink","EasyDebrid","Offcloud","TorBox"], entryValues: ["none","realdebrid","premiumize","alldebrid","debridlink","easydebrid","offcloud","torbox"] } },
            { key: "token_1", editTextPreference: { title: "Debrid API Token / Key", summary: "Enter API token if using a Debrid service (leave blank for standard Torrents)", value: "", dialogTitle: "Debrid API Token", dialogMessage: "Paste your API token from your Debrid account" } },
            { key: "number_of_links_1", listPreference: { title: "Maximum stream links to show", summary: "Controls how many streams are loaded per movie/episode", valueIndex: 2, entries: ["4","8","12","16","24","All"], entryValues: ["4","8","12","16","24","all"] } },
            { key: "sorting_link_1", listPreference: { title: "Sort Stream Links By", summary: "Preference for stream ordering", valueIndex: 0, entries: ["By Quality then Seeders","By Seeders","By Size"], entryValues: ["quality","seeders","size"] } },
            { key: "provider_selection_1", multiSelectListPreference: { title: "Scraper Torrent Providers", summary: "Select torrent providers to scrape streams from", entries: ["YTS","EZTV","RARBG","1337x","ThePirateBay","KickassTorrents","TorrentGalaxy","MagnetDL","NyaaSi","TokyoTosho","AniDex","Rutor","Rutracker","Comando","BluDV","Torrent9","ilCorSaRoNeRo","MejorTorrent","Wolfmax4k","Cinecalidad","BestTorrents"], entryValues: ["yts","eztv","rarbg","1337x","thepiratebay","kickasstorrents","torrentgalaxy","magnetdl","nyaasi","tokyotosho","anidex","rutor","rutracker","comando","bludv","torrent9","ilcorsaronero","mejortorrent","wolfmax4k","cinecalidad","besttorrents"], values: ["yts","eztv","rarbg","1337x","thepiratebay","kickasstorrents","torrentgalaxy","magnetdl","nyaasi"] } },
            { key: "quality_selection", multiSelectListPreference: { title: "Excluded Video Qualities", summary: "Select qualities you want to exclude from streams", entries: ["4K","1080p","720p","480p","CAM / TeleSync","SCR / Screener"], entryValues: ["4k","1080p","720p","480p","cam","scr"], values: ["cam","scr"] } }
        ];
    }
}
