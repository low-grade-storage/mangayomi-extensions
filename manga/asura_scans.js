const mangayomiSources = [{"id":524070078,"name":"Asura Scans (Optimized)","lang":"en","baseUrl":"https://asurascans.com","apiUrl":"https://api.asurascans.com","iconUrl":"https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png","typeSource":"single","itemType":0,"version":"0.0.1","dateFormat":"","dateFormatLocale":"","pkgPath":"manga/src/en/asurascans.js"}];

class DefaultExtension extends MProvider {
	constructor(...args) {
		super(...args);
		this._hasSessionAuthCache = null; this._accessTokenCache = ""; this._refreshTokenCache = "";
	}
	_trimTrailingSlash(u) { return String(u || "").trim().replace(/\/+$/, ""); }
	_normalizeSitePath(p, fb = "/") { const r = String(p || "").trim(); return !r ? fb : /^https?:\/\//i.test(r) ? r : r.startsWith("/") ? r : `/${r}`; }
	_parseJsonBody(body, ctx) {
		const raw = String(body || "").trim();
		try { return JSON.parse(raw); } catch (_) {
			const fo = raw.indexOf("{"), fa = raw.indexOf("["), f = fo === -1 ? fa : fa === -1 ? fo : Math.min(fo, fa);
			const lo = raw.lastIndexOf("}"), la = raw.lastIndexOf("]"), l = Math.max(lo, la);
			if (f !== -1 && l !== -1 && l > f) { try { return JSON.parse(raw.slice(f, l + 1)); } catch (_) {} }
			throw new Error(`Invalid JSON response in ${ctx}`);
		}
	}
	_getHeaderValue(headers, key) {
		if (!headers || typeof headers !== "object") return "";
		const norm = String(key || "").toLowerCase();
		for (const k of Object.keys(headers)) if (k.toLowerCase() === norm) return Array.isArray(headers[k]) ? headers[k].join("; ") : (headers[k] != null ? String(headers[k]) : "");
		return "";
	}
	_cacheAuthTokensFromResponse(res) {
		const cookie = this._getHeaderValue(res?.request?.headers, "cookie") || this._getHeaderValue(res?.headers, "set-cookie");
		if (!cookie) return;
		for (const part of cookie.split(";")) {
			const idx = part.indexOf("="); if (idx <= 0) continue;
			const n = part.slice(0, idx).trim(); let v = part.slice(idx + 1).trim(); if (!v) continue;
			try { v = decodeURIComponent(v); } catch (_) {}
			if (n === "access_token" && v !== this._accessTokenCache) { this._accessTokenCache = v; this._hasSessionAuthCache = null; }
			if (n === "refresh_token" && v !== this._refreshTokenCache) { this._refreshTokenCache = v; this._hasSessionAuthCache = null; }
		}
	}
	getHeaders() { return { Referer: this.siteBase }; }
	get apiHeaders() { return { Referer: this.siteBase }; }
	_buildApiHeaders(useAuth = false) {
		const h = { Referer: this.siteBase };
		if (useAuth && this._accessTokenCache) h.Authorization = `Bearer ${this._accessTokenCache}`;
		return h;
	}
	async _apiGet(url, useAuth = false) {
		const res = await new Client({ useDartHttpClient: true }).get(url, this._buildApiHeaders(useAuth));
		this._cacheAuthTokensFromResponse(res);
		return res;
	}
	async _refreshAccessToken() {
		if (!this._refreshTokenCache) return false;
		try {
			const res = await new Client({ useDartHttpClient: true }).post(`${this.apiBase}/api/auth/refresh`, { ...this.apiHeaders, "Content-Type": "application/json" }, { refresh_token: this._refreshTokenCache });
			this._cacheAuthTokensFromResponse(res);
			const data = this._parseJsonBody(res.body, "auth-refresh").data || this._parseJsonBody(res.body, "auth-refresh");
			if (data?.access_token) this._accessTokenCache = String(data.access_token);
			if (data?.refresh_token) this._refreshTokenCache = String(data.refresh_token);
			return !!this._accessTokenCache;
		} catch (_) { return false; }
	}
	async _hasSessionAuth() {
		if (this._hasSessionAuthCache != null) return this._hasSessionAuthCache;
		try {
			const res = await this._apiGet(`${this.apiBase}/api/users/me`, true), json = this._parseJsonBody(res.body, "session-auth-probe");
			return (this._hasSessionAuthCache = !!(json.data || json) && !json.error);
		} catch (_) { return (this._hasSessionAuthCache = false); }
	}
	get apiBase() { return this._trimTrailingSlash(new SharedPreferences().get("overrideApiUrl") || this.source.apiUrl); }
	get siteBase() { return this._trimTrailingSlash(new SharedPreferences().get("overrideSiteUrl") || this.source.baseUrl); }
	_slugFromUrl(url) {
		const raw = String(url || "").trim(); if (!raw) throw new Error("Missing manga URL");
		if (raw.includes("||")) return raw.split("||")[0];
		let p = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
		const m = p.match(/(?:^|\/)(?:comics|series)\/([^/]+)/i);
		if (m?.[1]) return m[1].replace(/-f[0-9a-f]{6,8}$/i, "");
		const segs = p.split("/").filter(Boolean);
		if (segs.length === 1) return segs[0].replace(/-f[0-9a-f]{6,8}$/i, "");
		throw new Error(`Unable to parse series slug from URL: ${url}`);
	}
	_chapterRefFromUrl(url) {
		const raw = String(url || "").trim(); if (!raw) throw new Error("Missing chapter URL");
		if (raw.includes("||")) { const [seriesSlug, chapterSlug] = raw.split("||"); return { seriesSlug, chapterSlug }; }
		const p = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
		if (p.length >= 3 && (p[0] === "comics" || p[0] === "series") && p[1]) return { seriesSlug: p[1].replace(/-f[0-9a-f]{6,8}$/i, ""), chapterSlug: p[p.length - 1] };
		throw new Error(`Unable to parse chapter URL: ${url}`);
	}
	_parseMangaList(json) {
		return { list: (json.data || []).map(i => ({ name: i.title || i.name || "", imageUrl: i.cover || i.cover_url || "", link: this._normalizeSitePath(i.public_url || (i.slug ? `/comics/${i.slug}` : ""), "/") })), hasNextPage: json.meta?.has_more === true };
	}
	toStatus(s) { const l = (s || "").toLowerCase(); return l === "ongoing" ? 0 : l === "completed" ? 1 : (l === "hiatus" || l === "seasonal") ? 2 : l === "dropped" ? 3 : 5; }
	parseDate(d) { if (!d) return null; const ts = Date.parse(d); return Number.isNaN(ts) ? null : String(ts); }
	async getPopular(page) { return this._parseMangaList(this._parseJsonBody((await this._apiGet(`${this.apiBase}/api/series?sort=rating&order=desc&offset=${(page - 1) * 20}&limit=20`, true)).body, "getPopular")); }
	async getLatestUpdates(page) { return this._parseMangaList(this._parseJsonBody((await this._apiGet(`${this.apiBase}/api/series?sort=latest&order=desc&offset=${(page - 1) * 20}&limit=20`, true)).body, "getLatestUpdates")); }
	async search(query, page, filters) {
		const sf = Array.isArray(filters) ? filters : [], sel = (idx, fb) => sf[idx]?.values?.[sf[idx]?.state]?.value ?? fb;
		const sort = sel(0, "rating"), order = sel(1, "desc"), status = sel(2, ""), type = sel(3, "");
		const genres = Array.isArray(sf[4]?.state) ? sf[4].state.filter(c => c.state).map(c => c.value).join(",") : "";
		let u = `${this.apiBase}/api/series?offset=${(page - 1) * 20}&limit=20&sort=${sort}&order=${order}`;
		if (query) u += `&search=${encodeURIComponent(query)}`;
		if (status) u += `&status=${status}`; if (type) u += `&type=${type}`; if (genres) u += `&genres=${encodeURIComponent(genres)}`;
		return this._parseMangaList(this._parseJsonBody((await this._apiGet(u, true)).body, "search"));
	}
	getFilterList() {
		const o = (n, v) => ({ type_name: "SelectOption", name: n, value: v }), cb = (n, v) => ({ type_name: "CheckBox", name: n, value: v });
		return [
			{ type_name: "SelectFilter", name: "Sort By", state: 0, values: [o("Rating", "rating"), o("Latest Update", "latest")] },
			{ type_name: "SelectFilter", name: "Sort Order", state: 1, values: [o("Ascending", "asc"), o("Descending", "desc")] },
			{ type_name: "SelectFilter", name: "Status", state: 0, values: [["All",""],["Ongoing","ongoing"],["Completed","completed"],["Hiatus","hiatus"],["Seasonal","seasonal"],["Dropped","dropped"]].map(x => o(x[0], x[1])) },
			{ type_name: "SelectFilter", name: "Type", state: 0, values: [["All",""],["Manhwa","manhwa"],["Manga","manga"],["Manhua","manhua"]].map(x => o(x[0], x[1])) },
			{ type_name: "GroupFilter", name: "Genres", state: [["Action","action"],["Adventure","adventure"],["Comedy","comedy"],["Crazy MC","crazy-mc"],["Demon","demon"],["Dungeons","dungeons"],["Fantasy","fantasy"],["Game","game"],["Genius MC","genius-mc"],["Isekai","isekai"],["Kuchikuchi","kuchikuchi"],["Magic","magic"],["Martial Arts","martial-arts"],["Murim","murim"],["Mystery","mystery"],["Necromancer","necromancer"],["Overpowered","overpowered"],["Regression","regression"],["Reincarnation","reincarnation"],["Revenge","revenge"],["Romance","romance"],["School Life","school-life"],["Sci-fi","sci-fi"],["Shoujo","shoujo"],["Shounen","shounen"],["System","system"],["Tower","tower"],["Tragedy","tragedy"],["Villain","villain"],["Violence","violence"]].map(x => cb(x[0], x[1])) }
		];
	}
	async getDetail(url) {
		const slug = this._slugFromUrl(url), res = await this._apiGet(`${this.apiBase}/api/series/${slug}`, true);
		const s = this._parseJsonBody(res.body, "getDetail-series").series || this._parseJsonBody(res.body, "getDetail-series");
		const description = (s.description || "").replace(/<[^>]+>/g, "").trim(), imageUrl = s.cover || s.cover_url || "";
		const seriesPublicUrl = this._normalizeSitePath(s.public_url || `/comics/${slug}`, `/comics/${slug}`);
		const author = s.author || "", artist = s.artist || "", status = this.toStatus(s.status), genre = (s.genres || []).map(g => g.name);
		const allChaps = [], seenKeys = new Set(), totalChaps = s.chapter_count || 100, limit = 100, offsets = [];
		for (let off = 0; off < totalChaps; off += limit) offsets.push(off);
		const responses = await Promise.all(offsets.map(off => this._apiGet(`${this.apiBase}/api/series/${slug}/chapters?offset=${off}&limit=${limit}`, true).then(r => this._parseJsonBody(r.body, `getDetail-offset-${off}`)).catch(() => ({ data: [] }))));
		for (const pageJson of responses) {
			for (const ch of (pageJson.data || [])) {
				const k = ch.id != null ? String(ch.id) : String(ch.slug || "");
				if (!k || seenKeys.has(k)) continue;
				seenKeys.add(k); allChaps.push(ch);
			}
		}
		const chapters = allChaps.map(ch => {
			const lbl = ch.number != null ? `Chapter ${ch.number}` : "Chapter", t = (ch.title || "").trim();
			return { name: t ? `${lbl} - ${t}` : lbl, url: `${seriesPublicUrl}/chapter/${ch.slug}`, dateUpload: this.parseDate(ch.published_at) };
		});
		return { name: s.title || s.name || "", imageUrl, description, genre, author, artist, status, chapters, episodes: chapters };
	}
	async getPageList(url) {
		const { seriesSlug, chapterSlug } = this._chapterRefFromUrl(url), endpoint = `${this.apiBase}/api/series/${seriesSlug}/chapters/${chapterSlug}`;
		const parsePages = (p) => (Array.isArray(p) ? p : []).map((x, i) => typeof x === "string" ? { url: x, order: i } : { url: x.url || x.image_url || x.page_url || x.image || x.src || "", order: x.order ?? x.index ?? i }).filter(x => !!x.url).sort((a, b) => a.order - b.order).map(x => x.url);
		const fetchCh = async (ctx) => {
			const j = this._parseJsonBody((await this._apiGet(endpoint, true)).body, ctx);
			const c = j.data?.chapter || j.chapter || j.data || j;
			return { pages: c?.pages || j.data?.pages || j.pages || [], isLocked: c?.is_locked ?? j.data?.is_locked ?? j.is_locked ?? false };
		};
		let cd = await fetchCh("getPageList-initial"), list = parsePages(cd.pages);
		if (list.length === 0 && cd.isLocked && this._accessTokenCache) { cd = await fetchCh("getPageList-bearer-retry"); list = parsePages(cd.pages); }
		if (list.length === 0 && cd.isLocked && this._refreshTokenCache && (await this._refreshAccessToken())) { cd = await fetchCh("getPageList-refresh-retry"); list = parsePages(cd.pages); }
		if (list.length > 0) return list.map(u => ({ url: typeof u === "string" ? u : (u.url || ""), headers: { Referer: "https://asurascans.com/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } }));
		if (!(await this._hasSessionAuth())) throw new Error("Chapter appears locked. Login via source WebView, then retry.");
		if (cd.isLocked) throw new Error("Chapter is locked (premium required on Asura Scans).");
		throw new Error("No readable pages found for this chapter");
	}
	getSourcePreferences() {
		const edit = (key, title, summary, value) => ({ key, editTextPreference: { title, summary, value, dialogTitle: title, dialogMessage: "" } });
		return [edit("overrideSiteUrl", "Override Site URL", "https://asurascans.com", "https://asurascans.com"), edit("overrideApiUrl", "Override API URL", "https://api.asurascans.com", "https://api.asurascans.com")];
	}
}
