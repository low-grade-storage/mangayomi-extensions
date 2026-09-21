const mangayomiSources = [{"id":715754009,"name":"Torrentio Anime (Torrent / Debrid)","lang":"all","baseUrl":"https://torrentio.strem.fun","apiUrl":"","iconUrl":"https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.torrentio.png","typeSource":"torrent","isManga":false,"itemType":1,"version":"0.0.1","pkgPath":"anime/src/all/torrentioanime.js"}];

class DefaultExtension extends MProvider {
    constructor() { super(); this.client = new Client(); }
    anilistQuery() { return `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$genres:[String],$year:String,$seasonYear:Int,$season:MediaSeason,$format:[MediaFormat],$status:[MediaStatus]){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}media(type:ANIME,sort:$sort,search:$search,status_in:$status,genre_in:$genres,startDate_like:$year,seasonYear:$seasonYear,season:$season,format_in:$format,isAdult:false){id title{romaji english native}coverImage{extraLarge large}description status tags{name}genres studios{nodes{name}}countryOfOrigin isAdult}}}`; }
    anilistLatestQuery() { return `query($page:Int,$perPage:Int,$sort:[AiringSort]){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}airingSchedules(airingAt_greater:0,airingAt_lesser:${Math.floor(Date.now()/1000)-10000},sort:$sort){media{id title{romaji english native}coverImage{extraLarge large}description status tags{name}genres studios{nodes{name}}countryOfOrigin isAdult}}}}`; }
    async makeGraphQLRequest(query, variables) { return this.client.post("https://graphql.anilist.co", { "Content-Type": "application/json" }, { query, variables }); }
    _pickTitle(title, pref) { return pref === "english" ? (title?.english?.trim() || title?.romaji || "") : pref === "native" ? (title?.native || title?.romaji || "") : (title?.romaji || ""); }
    parseSearchJson(jsonLine, isLatestQuery = false) {
        const meta = JSON.parse(jsonLine), prefTitle = new SharedPreferences().get("pref_title_1");
        const list = (isLatestQuery ? meta.data?.Page?.airingSchedules?.map(s => s.media) || [] : meta.data?.Page?.media || [])
            .filter(m => !((m?.countryOfOrigin === "CN" || m?.isAdult) && isLatestQuery))
            .map(m => ({ link: m?.id?.toString() || "", name: this._pickTitle(m?.title, prefTitle), imageUrl: m?.coverImage?.extraLarge || m?.coverImage?.large || "" }));
        return { list, hasNextPage: meta.data?.Page?.pageInfo?.hasNextPage || false };
    }
    async getPopular(page) { return this.parseSearchJson((await this.makeGraphQLRequest(this.anilistQuery(), { page, perPage: 30, sort: ["TRENDING_DESC"], status: ["FINISHED", "RELEASING"] })).body); }
    async getLatestUpdates(page) { return this.parseSearchJson((await this.makeGraphQLRequest(this.anilistLatestQuery(), { page, perPage: 30, sort: ["TIME_DESC"] })).body, true); }
    async search(query, page, filters) {
        let q = (query || "").trim();
        if (q.startsWith("https://")) { const p = q.split("/").filter(Boolean).pop(); if (p && !isNaN(p)) q = `id:${p}`; }
        if (q.startsWith("id:")) {
            const id = q.replace("id:", "").trim(), d = await this.getDetail(id);
            return { list: [{ link: id, name: d.name || id, imageUrl: d.imageUrl || "" }], hasNextPage: false };
        }
        const vars = { page, perPage: 30, sort: ["POPULARITY_DESC"] };
        if (q) vars.search = q;
        if (Array.isArray(filters)) {
            for (const f of filters) {
                if (f.type_name === "SelectFilter") {
                    const sel = f.values?.[f.state], v = Array.isArray(sel) ? sel[1] : (sel?.value ?? sel);
                    if (f.name === "Sort" && v) vars.sort = [v]; else if (f.name === "Year" && v) vars.year = `${v}%`; else if (f.name === "Season" && v) vars.season = v; else if (f.name === "Airing Status" && v) vars.status = [v];
                } else if (f.type_name === "GroupFilter") {
                    const vals = (f.state || []).filter(i => i.state === true).map(i => i.value);
                    if (f.name === "Format" && vals.length) vars.format = vals; else if (f.name === "Genres" && vals.length) vars.genres = vals;
                }
            }
        }
        return this.parseSearchJson((await this.makeGraphQLRequest(this.anilistQuery(), vars)).body);
    }
    async getDetail(url) {
        const q = `query($id:Int){Media(id:$id,isAdult:false){id title{romaji english native}coverImage{extraLarge large}description status season seasonYear format episodes tags{name}genres studios{nodes{name}}countryOfOrigin isAdult}}`;
        const m = JSON.parse((await this.makeGraphQLRequest(q, { id: parseInt(url) || url })).body).data?.Media;
        const prefs = new SharedPreferences(), name = this._pickTitle(m?.title, prefs.get("pref_title_1")), imageUrl = m?.coverImage?.extraLarge || m?.coverImage?.large || "";
        let desc = (m?.description || "No Description").replace(/<br\s*\/?>/gi, "\n").replace(/<.*?>/g, "").trim();
        if (m?.season || m?.seasonYear) desc += `\n\nRelease: ${m?.season || ""} ${m?.seasonYear || ""}`.trim();
        if (m?.format) desc += `\nType: ${m.format}`;
        if (m?.episodes) desc += `\nTotal Episode Count: ${m.episodes}`;
        const status = m?.status === "RELEASING" ? 0 : m?.status === "FINISHED" ? 1 : m?.status === "HIATUS" ? 2 : m?.status === "NOT_YET_RELEASED" ? 3 : 5;
        const genre = [...new Set([...(m?.tags?.map(t => t.name).filter(Boolean) || []), ...(m?.genres || [])])].sort();
        const author = (m?.studios?.nodes?.map(n => n.name).filter(Boolean) || []).sort().join(", ");
        let kitsuId = null, aniZipData = null;
        try { aniZipData = JSON.parse((await this.client.get(`https://api.ani.zip/mappings?anilist_id=${url}`)).body); kitsuId = aniZipData.mappings?.kitsu_id?.toString() || null; } catch (_) {}
        if (!kitsuId) {
            try { kitsuId = JSON.parse((await this.client.get(`https://kitsu.io/api/edge/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${url}&include=item`)).body).data?.[0]?.relationships?.item?.data?.id?.toString() || null; } catch (_) {}
        }
        if (!kitsuId) return { name, imageUrl, description: desc, status, genre, author, episodes: [] };
        const showUpcoming = prefs.get("pref_upcoming_ep_1") ?? false, now = Date.now();
        let episodes = [];
        if (aniZipData?.episodes && Object.keys(aniZipData.episodes).length > 0) {
            if (aniZipData.mappings?.type === "MOVIE") {
                const ep1 = aniZipData.episodes["1"], rd = ep1?.airdate ? new Date(ep1.airdate).getTime() : 0;
                episodes = [{ url: `/stream/movie/kitsu:${kitsuId}.json`, name: "Movie", dateUpload: rd ? rd.toString() : "" }];
            } else {
                for (const k of Object.keys(aniZipData.episodes)) {
                    const ep = aniZipData.episodes[k]; if (!ep) continue;
                    const num = ep.episodeNumber || ep.episode || k, at = ep.airdate ? new Date(ep.airdate).getTime() : 0;
                    if (!showUpcoming && at > now) continue;
                    const t = ep.title?.en || ep.title?.["x-jat"] || ep.title?.ja || "";
                    episodes.push({ url: `/stream/series/kitsu:${kitsuId}:${num}.json`, name: t ? `Episode ${num}: ${t}` : `Episode ${num}`, dateUpload: at ? at.toString() : "", scanlator: (at > now) ? "Upcoming" : "" });
                }
                episodes = episodes.reverse();
            }
        } else {
            try {
                const el = JSON.parse((await this.client.get(`https://anime-kitsu.strem.fun/meta/series/kitsu%3A${kitsuId}.json`)).body);
                if (el.meta?.type === "series" && el.meta.videos) {
                    episodes = el.meta.videos.filter(v => showUpcoming || !v.released || new Date(v.released).getTime() <= now).map(v => ({ url: `/stream/series/kitsu:${kitsuId}:${v.episode}.json`, dateUpload: (v.released ? new Date(v.released).getTime() : now).toString(), name: `Episode ${v.episode}${v.title ? " : " + v.title.replace(/^Episode \d+\s*:?\s*/i, "").trim() : ""}` })).reverse();
                } else if (el.meta?.type === "movie") episodes = [{ url: `/stream/movie/kitsu:${kitsuId}.json`, name: "Movie" }];
            } catch (_) {}
        }
        return { name, imageUrl, description: desc, status, genre, author, episodes };
    }
    appendQueryParam(k, v) { const a = (Array.isArray(v) ? v : (v instanceof Set ? Array.from(v) : [v])).filter(x => typeof x === "string" && x.trim() !== ""); return a.length ? `${k}=${a.join(",")}|` : ""; }
    async getVideoList(url) {
        const prefs = new SharedPreferences(), dp = prefs.get("debrid_provider_1") || "none", token = (prefs.get("token_1") || "").trim();
        if (dp !== "none" && !token) throw new Error("Kindly input the debrid token in the extension settings.");
        let u = `${this.source.baseUrl}/` + this.appendQueryParam("providers", prefs.get("provider_selection_1")) + this.appendQueryParam("language", prefs.get("lang_selection")) + this.appendQueryParam("qualityfilter", prefs.get("quality_selection")) + this.appendQueryParam("sort", new Set([prefs.get("sorting_link_1")])) + (dp !== "none" ? `${dp}=${token}|` : "") + url;
        u = u.replace(/\|$/, "");
        const streams = JSON.parse((await this.client.get(u)).body)?.streams || [];
        const tr = ["http://nyaa.tracker.wf:7777/announce","http://anidex.moe:6969/announce","http://tracker.anirena.com:80/announce","udp://tracker.uw0.xyz:6969/announce","http://share.camoe.cn:8080/announce","http://t.nyaatracker.com:80/announce","udp://47.ip-51-68-199.eu:6969/announce","udp://9.rarbg.me:2940","udp://9.rarbg.to:2820","udp://exodus.desync.com:6969/announce","udp://explodie.org:6969/announce","udp://ipv4.tracker.harry.lu:80/announce","udp://open.stealth.si:80/announce","udp://opentor.org:2710/announce","udp://opentracker.i2p.rocks:6969/announce","udp://retracker.lanta-net.ru:2710/announce","udp://tracker.cyberia.is:6969/announce","udp://tracker.dler.org:6969/announce","udp://tracker.ds.is:6969/announce","udp://tracker.internetwarriors.net:1337","udp://tracker.openbittorrent.com:6969/announce","udp://tracker.opentrackr.org:1337/announce","udp://tracker.tiny-vps.com:6969/announce","udp://tracker.torrent.eu.org:451/announce","udp://valakas.rollo.dnsabr.com:2710/announce","udp://www.torrent.eu.org:451/announce"].join("&tr=");
        let videos = this.sortVideos(streams.map(s => {
            const vUrl = (dp !== "none" && s.url) ? s.url : `magnet:?xt=urn:btih:${s.infoHash}&dn=${s.infoHash}&tr=${tr}${s.fileIdx != null ? "&index=" + s.fileIdx : ""}`;
            return { url: vUrl, originalUrl: vUrl, quality: `${(s.name || "").replace("Torrentio\n", "")}\n${s.title || ""}`.trim() };
        }));
        const nol = prefs.get("number_of_links_1");
        return (!nol || nol === "all") ? videos : videos.slice(0, parseInt(nol));
    }
    sortVideos(videos) {
        const prefs = new SharedPreferences(), isDub = prefs.get("dubbed"), isEff = prefs.get("efficient_1");
        return videos.sort((a, b) => (/\[(.+?) download\]/.test(a.quality) - /\[(.+?) download\]/.test(b.quality)) || ((isDub && !a.quality.toLowerCase().includes("dubbed")) - (isDub && !b.quality.toLowerCase().includes("dubbed"))) || ((isEff && !["hevc","265","av1"].some(q => a.quality.toLowerCase().includes(q))) - (isEff && !["hevc","265","av1"].some(q => b.quality.toLowerCase().includes(q)))));
    }
    getFilterList() {
        const opt = (n, v) => ({ type_name: "SelectOption", name: n, value: v }), cb = (n, v) => ({ type_name: "CheckBox", name: n, value: v, state: false });
        return [
            { type_name: "SelectFilter", name: "Sort", state: 0, values: [["Popularity","POPULARITY_DESC"],["Trending","TRENDING_DESC"],["Average Score","SCORE_DESC"],["Release Date","START_DATE_DESC"],["Title","TITLE_ENGLISH_DESC"],["Favorites","FAVOURITES_DESC"],["Date Added","ID_DESC"]].map(x => opt(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Format", state: [["TV Show","TV"],["Movie","MOVIE"],["TV Short","TV_SHORT"],["Special","SPECIAL"],["OVA","OVA"],["ONA","ONA"],["Music","MUSIC"]].map(x => cb(x[0], x[1])) },
            { type_name: "GroupFilter", name: "Genres", state: ["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"].map(g => cb(g, g)) },
            { type_name: "SelectFilter", name: "Year", state: 0, values: [["Any",""], ...Array.from({ length: 87 }, (_, i) => [String(2026 - i), String(2026 - i)])].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Season", state: 0, values: [["Any",""],["Winter","WINTER"],["Spring","SPRING"],["Summer","SUMMER"],["Fall","FALL"]].map(x => opt(x[0], x[1])) },
            { type_name: "SelectFilter", name: "Airing Status", state: 0, values: [["Any",""],["Airing","RELEASING"],["Finished","FINISHED"],["Not Yet Aired","NOT_YET_RELEASED"],["Cancelled","CANCELLED"]].map(x => opt(x[0], x[1])) }
        ];
    }
    getSourcePreferences() {
        return [
            { key: "debrid_provider_1", listPreference: { title: "Debrid Provider", summary: "Choose 'None' for Torrent. If you select a Debrid provider, enter your token key below.", valueIndex: 0, entries: ["None","RealDebrid","Premiumize","AllDebrid","DebridLink","EasyDebrid","Offcloud","TorBox"], entryValues: ["none","realdebrid","premiumize","alldebrid","debridlink","easydebrid","offcloud","torbox"] } },
            { key: "token_1", editTextPreference: { title: "Debrid API Token / Key", summary: "Exclusive to Debrid providers; not intended for Torrents.", value: "", dialogTitle: "Debrid API Token / Key", dialogMessage: "Enter your Debrid service API key/token" } },
            { key: "number_of_links_1", listPreference: { title: "Number of links to load for video list", summary: "⚠️ Increasing the number of links will increase the loading time of the video list", valueIndex: 1, entries: ["2","4","8","12","all"], entryValues: ["2","4","8","12","all"] } },
            { key: "provider_selection_1", multiSelectListPreference: { title: "Enable/Disable Providers", summary: "", entries: ["YTS","EZTV","RARBG","1337x","ThePirateBay","KickassTorrents","TorrentGalaxy","MagnetDL","HorribleSubs","NyaaSi","TokyoTosho","AniDex","nekoBT","🇷🇺 Rutor","🇷🇺 Rutracker","🇵🇹 Comando","🇵🇹 BluDV","🇫🇷 Torrent9","🇮🇹 ilCorSaRoNero","🇪🇸 MejorTorrent","🇪🇸 Wolfmax4k","🇲🇽 Cinecalidad","🇵🇱 BestTorrents"], entryValues: ["yts","eztv","rarbg","1337x","thepiratebay","kickasstorrents","torrentgalaxy","magnetdl","horriblesubs","nyaasi","tokyotosho","anidex","nekobt","rutor","rutracker","comando","bludv","torrent9","ilcorsaronero","mejortorrent","wolfmax4k","cinecalidad","besttorrents"], values: ["nyaasi","tokyotosho","anidex"] } },
            { key: "quality_selection", multiSelectListPreference: { title: "Exclude Qualities/Resolutions", summary: "", entries: ["BluRay REMUX","HDR/HDR10+/Dolby Vision","Dolby Vision","4k","1080p","720p","480p","Other (DVDRip/HDRip/BDRip...)","Screener","Cam","Unknown"], entryValues: ["brremux","hdrall","dolbyvision","4k","1080p","720p","480p","other","scr","cam","unknown"], values: ["720p","480p","other","scr","cam","unknown"] } },
            { key: "lang_selection", multiSelectListPreference: { title: "Priority foreign language", summary: "", entries: ["🇯🇵 Japanese","🇷🇺 Russian","🇮🇹 Italian","🇵🇹 Portuguese","🇪🇸 Spanish","🇲🇽 Latino","🇰🇷 Korean","🇨🇳 Chinese","🇹🇼 Taiwanese","🇫🇷 French","🇩🇪 German","🇳🇱 Dutch","🇮🇳 Hindi","🇮🇳 Telugu","🇮🇳 Tamil","🇵🇱 Polish","🇱🇹 Lithuanian","🇱🇻 Latvian","🇪🇪 Estonian","🇨🇿 Czech","🇸🇰 Slovakian","🇸🇮 Slovenian","🇭🇺 Hungarian","🇷🇴 Romanian","🇧🇬 Bulgarian","🇷🇸 Serbian","🇭🇷 Croatian","🇺🇦 Ukrainian","🇬🇷 Greek","🇩🇰 Danish","🇫🇮 Finnish","🇸🇪 Swedish","🇳🇴 Norwegian","🇹🇷 Turkish","🇸🇦 Arabic","🇮🇷 Persian","🇮🇱 Hebrew","🇻🇳 Vietnamese","🇮🇩 Indonesian","🇲🇾 Malay","🇹🇭 Thai"], entryValues: ["japanese","russian","italian","portuguese","spanish","latino","korean","chinese","taiwanese","french","german","dutch","hindi","telugu","tamil","polish","lithuanian","latvian","estonian","czech","slovakian","slovenian","hungarian","romanian","bulgarian","serbian","croatian","ukrainian","greek","danish","finnish","swedish","norwegian","turkish","arabic","persian","hebrew","vietnamese","indonesian","malay","thai"], values: [] } },
            { key: "sorting_link_1", listPreference: { title: "Sorting", summary: "", valueIndex: 0, entries: ["By quality then seeders","By quality then size","By seeders","By size"], entryValues: ["quality","qualitysize","seeders","size"] } },
            { key: "pref_title_1", listPreference: { title: "Preferred Title", summary: "", valueIndex: 0, entries: ["Romaji","English","Native"], entryValues: ["romaji","english","native"] } },
            { key: "pref_upcoming_ep_1", switchPreferenceCompat: { title: "Show Upcoming Episodes", summary: "Show unreleased / upcoming episodes in the episode list", value: false } },
            { key: "dubbed", switchPreferenceCompat: { title: "Dubbed Video Priority", summary: "", value: false } },
            { key: "efficient_1", switchPreferenceCompat: { title: "Efficient Video Priority", summary: "Codec: (HEVC / x265) & AV1. High-quality video with less data usage.", value: false } }
        ];
    }
}
