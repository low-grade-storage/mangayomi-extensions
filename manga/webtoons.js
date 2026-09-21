const mangayomiSources = [{"id":118325925,"name":"Webtoons (Optimized)","lang":"en","langs":["en","fr","id","th","es","zh","de"],"baseUrl":"https://www.webtoons.com","apiUrl":"","iconUrl":"https://upload.wikimedia.org/wikipedia/commons/0/09/Naver_Line_Webtoon_logo.png","typeSource":"single","isManga":true,"isNsfw":false,"version":"0.0.1","dateFormat":"","dateFormatLocale":"","pkgPath":"manga/src/all/webtoons.js"}];

class DefaultExtension extends MProvider {
  headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Referer": "https://www.webtoons.com/" };
  mobileUrl = "https://m.webtoons.com";
  getHeaders() { return this.headers; }
  getFormattedUrl(k) { const u = new SharedPreferences().get(k) || this.source.baseUrl; return u.endsWith("/") ? u.slice(0, -1) : u; }
  getBaseUrl() { return this.getFormattedUrl("domain_url"); }
  getMobileUrl() { return this.getFormattedUrl("mobile_url"); }
  mangaFromElement(doc) {
    const list = [];
    for (const el of doc.select(`div.webtoon_list_wrap li a, ul.webtoon_list li a, div.card_wrap li a, ul.challenge_lst li a, div.challenge_lst li a`)) {
      const img = el.selectFirst("img"), raw = img?.getSrc || img?.attr("src") || img?.attr("data-url") || "";
      const name = el.selectFirst("strong.title, .title, .subj")?.text?.trim() || "", link = el.getHref || el.attr("href") || "";
      if (name && link) list.push({ name, imageUrl: raw.replace("://webtoon-phinf.pstatic.net", "://swebtoon-phinf.pstatic.net"), link });
    }
    return list;
  }
  async getPopular(page) { return { list: this.mangaFromElement(new Document((await new Client().get(`${this.getBaseUrl()}/${this.langCode()}/originals`)).body)), hasNextPage: false }; }
  async getLatestUpdates(page) { return { list: this.mangaFromElement(new Document((await new Client().get(`${this.getBaseUrl()}/${this.langCode()}/originals?sortOrder=UPDATE`)).body)), hasNextPage: false }; }
  async search(query, page, filters) {
    const getVal = t => filters?.find(f => f.type === t)?.values?.[filters?.find(f => f.type === t)?.state]?.value ?? "";
    let url = `${this.getBaseUrl()}/${this.langCode()}`;
    if (query) url += `/search/${getVal("searchType")}?keyword=${query.trim().replace(/\s+/g, "+")}&page=${page}`;
    else {
      const r = getVal("rankingType"), w = getVal("weekday"), g = getVal("genre"), s = getVal("sortOrder");
      if (r) url += `/ranking/${r}`; else if (w) url += `/originals/${w}?sortOrder=${s}`; else if (g) url += `/genres/${g}?sortOrder=${s}`;
    }
    const list = this.mangaFromElement(new Document((await new Client().get(url)).body));
    return { list, hasNextPage: query ? list.length !== 0 : false };
  }
  parseEpisodesFromDoc(doc) {
    const chs = [];
    for (const el of doc.select("ul#_listUl li._episodeItem")) {
      const a = el.selectFirst("a.detail_list_link");
      if (!a) continue;
      const titleSpan = el.selectFirst("span.subj span") || el.selectFirst("span.subj"), dateEl = el.selectFirst("span.date");
      let dateUpload = null;
      if (dateEl) { try { dateUpload = new Date(this.formatDateString(dateEl.text.trim(), this.source.lang)).getTime().toString(); } catch (_) {} }
      chs.push({ name: titleSpan ? titleSpan.text.trim() : "", url: a.getHref.replace(/&amp;/g, "&"), dateUpload: dateUpload || Date.now().toString() });
    }
    return chs;
  }
  async getDetail(url) {
    const cleanUrl = url.replace("m.webtoons.com", "www.webtoons.com"), p1Url = cleanUrl.includes("?") ? `${cleanUrl}&page=1` : `${cleanUrl}?page=1`;
    const doc = new Document((await new Client().get(p1Url, this.getHeaders(p1Url))).body);
    const info = doc.selectFirst("div.cont_box") || doc.selectFirst("div.detail_header");
    const name = info?.selectFirst("h1.subj, h3.subj, .subj")?.text || "", genres = Array.from(info?.select("p.genre") || []).map(e => e.text).filter(Boolean);
    const genre = genres.length ? genres : [info?.selectFirst("div.info h2")?.text || ""];
    const author = info?.selectFirst("div.author_area")?.text.replace(/\s+/g, " ").replace(/author info/g, "").trim() ?? info?.selectFirst("a.author")?.text ?? "";
    const day = info?.selectFirst("p.day_info")?.text || "";
    const status = ["UP", "EVERY", "NOUVEAU"].some(s => day.includes(s)) ? 0 : ["END", "TERMIN", "COMPLETED"].some(s => day.includes(s)) ? 1 : -1;
    const description = (info?.selectFirst("p.summary")?.text || "").replace(/\s+/g, " ").trim();
    const rawCover = doc.selectFirst("meta[property='og:image']")?.attr("content") || doc.selectFirst("div.detail_header img, span.thmb img, div.cont_box img")?.getSrc || "";
    const imageUrl = rawCover.replace("://webtoon-phinf.pstatic.net", "://swebtoon-phinf.pstatic.net");
    const chapters = this.parseEpisodesFromDoc(doc);
    let maxPage = 1;
    for (const l of doc.select("div.paginate a")) { const m = (l.attr("href") || l.getHref || "").match(/page=(\d+)/); if (m && parseInt(m[1], 10) > maxPage) maxPage = parseInt(m[1], 10); }
    if (maxPage > 1) {
      const client = new Client(), h = this.getHeaders(cleanUrl), reqs = [];
      for (let p = 2; p <= Math.min(maxPage, 30); p++) reqs.push(client.get(cleanUrl.includes("?") ? `${cleanUrl}&page=${p}` : `${cleanUrl}?page=${p}`, h).then(r => this.parseEpisodesFromDoc(new Document(r.body))).catch(() => []));
      (await Promise.all(reqs)).forEach(chList => chapters.push(...chList));
    }
    return { name, link: cleanUrl, imageUrl, genre, description, author, status, chapters, episodes: chapters };
  }
  langCode() { return { en: "en", fr: "fr", id: "id", th: "th", es: "es", zh: "zh-hant", de: "de" }[this.source.lang]; }
  formatDateString(str, lang) {
    const months = { en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], fr: ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."], id: ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"], th: ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."], es: ["ene.","feb.","mar.","abr.","may.","jun.","jul.","ago.","sep.","oct.","nov.","dic."] }[lang] || [];
    let p, m, d, y;
    if (lang === "zh") { const match = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); if (match) [, y, m, d] = match; }
    else if (lang === "de") { p = str.split("."); if (p.length === 3) [d, m, y] = p; }
    else if (["es","fr","id","th"].includes(lang)) { p = str.split(" "); if (p.length === 3) { m = months.indexOf(p[1]) + 1; d = p[0]; y = p[2]; } }
    else { p = str.split(" "); if (p.length === 3) { m = months.indexOf(p[0]) + 1; d = p[1].replace(",", ""); y = p[2]; } }
    return (!m || !y || !d) ? Date.now() : `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }
  async getPageList(url) {
    const doc = new Document((await new Client().get(url.replace(/&amp;/g, "&"), this.getHeaders())).body), urls = [];
    for (const img of doc.selectFirst("div#_imageList")?.select("img") || []) {
      const u = img.attr("data-url") || img.attr("src") || img.getSrc;
      if (u && !u.includes("bg_transparency.png")) urls.push(u.replace("://webtoon-phinf.pstatic.net", "://swebtoon-phinf.pstatic.net"));
    }
    return urls.map(u => ({ url: u, headers: { Referer: "https://www.webtoons.com/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } }));
  }
  getFilterList() {
    const o = (n, v) => ({ type_name: "SelectOption", name: n, value: v });
    return [
      { type: "header", name: "Filter Priority: Search > Ranking > Day > Genre | Sort applies to Day/Genre", type_name: "HeaderFilter" },
      { type: "separator", type_name: "SeparatorFilter" },
      { type: "searchType", name: "Search Type", type_name: "SelectFilter", state: 0, values: [o("Originals", "originals"), o("Canvas", "canvas")] },
      { type: "separator", type_name: "SeparatorFilter" },
      { type: "rankingType", name: "Ranking Category", type_name: "SelectFilter", values: [["Not Selected",""],["Trending","trending"],["Popular","popular"],["Originals","originals"],["Canvas","canvas"]].map(x => o(x[0], x[1])) },
      { type: "separator", type_name: "SeparatorFilter" },
      { type: "sortOrder", name: "Sort By (For Schedule & Genres)", type_name: "SelectFilter", state: 0, values: [o("Popular (MANA)", "MANA"), o("Likes", "LIKEIT"), o("Newest", "UPDATE")] },
      { type: "weekday", name: "Update Schedule", type_name: "SelectFilter", values: [["Day",""],["Monday","monday"],["Tuesday","tuesday"],["Wednesday","wednesday"],["Thursday","thursday"],["Friday","friday"],["Saturday","saturday"],["Sunday","sunday"],["Completed","complete"]].map(x => o(x[0], x[1])) },
      { type: "genre", name: "Genre", type_name: "SelectFilter", values: [["All Genres",""],["Drama","drama"],["Fantasy","fantasy"],["Comedy","comedy"],["Action","action"],["Slice of Life","slice_of_life"],["Romance","romance"],["Superhero","super_hero"],["Sci-Fi","sf"],["Thriller","thriller"],["Supernatural","supernatural"],["Mystery","mystery"],["Sports","sports"],["Historical","historical"],["Heartwarming","heartwarming"],["Horror","horror"],["Graphic Novel","graphic_novel"],["Informative","tiptoon"]].map(x => o(x[0], x[1])) }
    ];
  }
  getSourcePreferences() {
    return [
      { key: "domain_url", editTextPreference: { title: "Override BaseUrl", summary: "", value: this.source.baseUrl, dialogTitle: "URL", dialogMessage: "" } },
      { key: "mobile_url", editTextPreference: { title: "Override mobileUrl", summary: "", value: this.mobileUrl, dialogTitle: "URL", dialogMessage: "" } }
    ];
  }
}
