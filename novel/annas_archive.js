const mangayomiSources = [{"name":"Annas Archive","lang":"en","baseUrl":"https://annas-archive.is","apiUrl":"","iconUrl":"https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.annasarchive.png","typeSource":"single","itemType":2,"version":"0.0.1","appMinVerReq":"0.6.1","dateFormat":"","dateFormatLocale":"","pkgPath":"novel/src/all/annasarchive.js","isNsfw":false,"hasCloudflare":true,"notes":"Downloads EPUB files to read chapters. Use WebView if Cloudflare/DDoS-Guard check is needed."}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    try {
      const p = new SharedPreferences().get("override_base_url");
      if (p && typeof p === "string" && p.trim().startsWith("http")) return p.trim().replace(/\/+$/, "");
    } catch (_) {}
    return this.source.baseUrl;
  }
  getAccountKey() {
    try {
      const p = new SharedPreferences().get("account_key");
      if (p && typeof p === "string") return p.trim();
    } catch (_) {}
    return "";
  }
  getHeaders(url) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${this.getBaseUrl()}/`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    };
  }
  mangaListFromPage(res) {
    if (!res?.body) return { list: [], hasNextPage: false };
    const doc = new Document(res.body.replaceAll(/<!--|-->/g, "")), list = [], seen = new Set();
    for (const h3 of doc.select("h3")) {
      const a = h3.selectFirst("a"), href = a ? (a.getHref || a.attr("href") || "") : "";
      if (!a || (!href.includes("/books/") && !href.includes("/md5/")) || seen.has(href)) continue;
      seen.add(href);
      const name = (a.text || h3.text || "").replaceAll("🔍", "").trim();
      if (!name) continue;
      const img = h3.parent?.parent?.selectFirst("img");
      list.push({ name, imageUrl: img ? (img.getSrc || img.attr("src") || "") : "", link: href.startsWith("http") ? href : `${this.getBaseUrl()}${href.startsWith("/") ? "" : "/"}${href}` });
    }
    if (list.length === 0) {
      for (const a of doc.select("a")) {
        const href = a.getHref || a.attr("href") || "";
        if ((href.includes("/books/") || href.includes("/md5/")) && !seen.has(href)) {
          seen.add(href);
          const name = (a.selectFirst("h3")?.text || a.text || "").replaceAll("🔍", "").trim(), img = a.selectFirst("img");
          if (name && name.length > 1) list.push({ name, imageUrl: img ? (img.getSrc || img.attr("src") || "") : "", link: href.startsWith("http") ? href : `${this.getBaseUrl()}${href.startsWith("/") ? "" : "/"}${href}` });
        }
      }
    }
    const hasNextPage = doc.select("a").some(pl => (pl.text?.includes("Next") || pl.text?.includes("»")) && (pl.getHref || pl.attr("href") || "").includes("page="));
    return { list, hasNextPage };
  }
  async getPopular(page) { return this.mangaListFromPage(await new Client().get(`${this.getBaseUrl()}/search?q=&page=${Math.max(1, parseInt(page) || 1)}&ext=epub&sort=`, this.getHeaders())); }
  async getLatestUpdates(page) { return this.mangaListFromPage(await new Client().get(`${this.getBaseUrl()}/search?q=&page=${Math.max(1, parseInt(page) || 1)}&ext=epub&sort=newest`, this.getHeaders())); }
  async search(query, page) { return this.mangaListFromPage(await new Client().get(`${this.getBaseUrl()}/search?q=${encodeURIComponent((query || "").trim())}&page=${Math.max(1, parseInt(page) || 1)}&ext=epub`, this.getHeaders())); }
  async getDetail(url) {
    const client = new Client(), fullUrl = url.startsWith("http") ? url : `${this.getBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await client.get(fullUrl, this.getHeaders(fullUrl)), doc = new Document(res.body);
    const name = (doc.selectFirst("h1")?.text || doc.selectFirst("div.text-3xl")?.text || doc.selectFirst("meta[property='og:title']")?.attr("content") || "Unknown Title").trim();
    let description = (doc.selectFirst("#book-panel-overview p") || doc.selectFirst("div.mb-1"))?.text.trim().replace(/^description/i, "").trim() || doc.selectFirst("meta[property='og:description']")?.attr("content") || "";
    const author = (doc.selectFirst("a[href*='/search?q='][class*='custom-a']") || doc.selectFirst("div.italic"))?.text.replaceAll("🔍", "").trim() || "";
    const img = doc.selectFirst("img"), imageUrl = img ? (img.getSrc || img.attr("src") || "") : "";
    const md5Match = (fullUrl + res.body).match(/[a-f0-9]{32}/i), md5 = md5Match ? md5Match[0] : "";
    let bookLink = null, key = this.getAccountKey();
    if (key && md5) {
      try {
        const d = JSON.parse((await client.get(`${this.getBaseUrl()}/dyn/api/fast_download.json?key=${key}&md5=${md5}`, this.getHeaders())).body);
        if (d?.download_url) bookLink = d.download_url;
      } catch (_) {}
    }
    if (!bookLink) bookLink = await this._resolveDownloadLink(client, doc, fullUrl);
    const chapters = [];
    if (bookLink) {
      try {
        const book = await parseEpub(name, bookLink, { Connection: "Keep-Alive", ...this.getHeaders(bookLink) });
        if (Array.isArray(book?.chapters)) {
          for (const ch of book.chapters) chapters.push({ name: ch, url: `${bookLink};;;${ch}`, dateUpload: String(Date.now()), scanlator: null });
        }
      } catch (_) {}
    }
    if (chapters.length === 0) chapters.push({ name: "Open in WebView to solve verification or enter Member Key in Settings", url: `${fullUrl};;;info`, dateUpload: String(Date.now()), scanlator: "Notice" });
    return { description, imageUrl, author, genre: ["Novel", "Ebook"], status: 1, chapters };
  }
  async _resolveDownloadLink(client, doc, pageUrl) {
    for (const a of doc.select("a")) {
      const h = a.getHref || a.attr("href") || "";
      if (!h) continue;
      if (h.endsWith(".epub") && h.startsWith("http")) return h;
      if (["libgen.li", "libgen.rs", "books.ms", "libgen.is"].some(d => h.includes(d))) {
        const r = await this._resolveLibgen(client, h);
        if (r) return r;
      }
      if (["ipfs.io", "cloudflare-ipfs.com", "pinata.cloud"].some(d => h.includes(d))) return h;
    }
    return null;
  }
  async _resolveLibgen(client, mirrorLink) {
    try {
      const doc = new Document((await client.get(mirrorLink, this.getHeaders(mirrorLink))).body);
      for (const l of doc.select("a")) {
        const h = l.getHref || l.attr("href") || "";
        if (h.includes("get.php") || h.endsWith(".epub")) return h.startsWith("http") ? h : new URL(h, mirrorLink).href;
      }
    } catch (_) {}
    return null;
  }
  async getHtmlContent(name, url) {
    const [bookLink, chapterTitle = ""] = url.split(";;;");
    if (chapterTitle === "info" || !bookLink.startsWith("http")) return `<html><body><h3>Anna's Archive Notice</h3><p>To read EPUB chapters that require verification or membership, open this book in Mangayomi's WebView (globe icon) to solve the security check or log into your account. If you have an Anna's Archive account key, enter it in Extension Settings.</p></body></html>`;
    return await parseEpubChapter(name, bookLink, { Connection: "Keep-Alive", ...this.getHeaders(bookLink) }, chapterTitle);
  }
  async cleanHtmlContent(html) { return html; }
  getFilterList() { return []; }
  getSourcePreferences() {
    return [
      { key: "override_base_url", editTextPreference: { title: "Override Base URL", summary: "Default: https://annas-archive.is (Alternatives: https://annas-archive.gl, https://annas-archive.pk)", value: "https://annas-archive.is", dialogTitle: "Anna's Archive Mirror URL", dialogMessage: "Enter active mirror URL" } },
      { key: "account_key", editTextPreference: { title: "Account Secret Key / Member Key", summary: "Optional: Secret key from your Anna's Archive account for direct fast downloads", value: "", dialogTitle: "Account Secret Key", dialogMessage: "Enter your account key" } }
    ];
  }
}
