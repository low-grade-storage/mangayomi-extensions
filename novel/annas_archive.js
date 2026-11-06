const mangayomiSources = [
  {
    "name": "Annas Archive",
    "lang": "en",
    "baseUrl": "https://annas-archive.is",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.annasarchive.png",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.4",
    "appMinVerReq": "0.6.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "novel/src/all/annasarchive.js",
    "isNsfw": false,
    "hasCloudflare": true,
    "notes": "Downloads EPUB files to read chapters. Use WebView if Cloudflare/DDoS-Guard check is needed."
  }
];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    try {
      const pref = new SharedPreferences().get("override_base_url");
      if (pref && typeof pref === "string" && pref.trim().startsWith("http")) {
        return pref.trim().replace(/\/+$/, "");
      }
    } catch (_) {}
    return this.source.baseUrl;
  }

  getAccountKey() {
    try {
      const pref = new SharedPreferences().get("account_key");
      if (pref && typeof pref === "string") {
        return pref.trim();
      }
    } catch (_) {}
    return "";
  }

  getHeaders(url) {
    return {
      "Referer": `${this.getBaseUrl()}/`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    };
  }

  mangaListFromPage(res) {
    if (!res || !res.body) return { list: [], hasNextPage: false };
    const doc = new Document(res.body.replaceAll(/<!--|-->/g, ""));
    const list = [];
    const seenLinks = new Set();

    // Strategy 1: Scan h3 headings with links
    const h3Elements = doc.select("h3");
    for (const h3 of h3Elements) {
      const anchor = h3.selectFirst("a");
      if (!anchor) continue;
      const rawHref = anchor.getHref || anchor.attr("href") || "";
      if (!rawHref.includes("/books/") && !rawHref.includes("/md5/")) continue;
      if (seenLinks.has(rawHref)) continue;
      seenLinks.add(rawHref);

      const name = (anchor.text || h3.text || "").replaceAll("🔍", "").trim();
      if (!name) continue;

      let imageUrl = "";
      const parent = h3.parent;
      const grandParent = parent ? parent.parent : null;
      if (grandParent) {
        const img = grandParent.selectFirst("img");
        if (img) {
          imageUrl = img.getSrc || img.attr("src") || "";
        }
      }

      const link = rawHref.startsWith("http") ? rawHref : `${this.getBaseUrl()}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
      list.push({ name, imageUrl, link });
    }

    // Strategy 2: Fall back to scanning all anchors with book/md5 links
    if (list.length === 0) {
      const anchors = doc.select("a");
      for (const a of anchors) {
        const rawHref = a.getHref || a.attr("href") || "";
        if ((rawHref.includes("/books/") || rawHref.includes("/md5/")) && !seenLinks.has(rawHref)) {
          seenLinks.add(rawHref);
          const name = (a.selectFirst("h3")?.text || a.text || "").replaceAll("🔍", "").trim();
          const img = a.selectFirst("img");
          const imageUrl = img ? (img.getSrc || img.attr("src") || "") : "";
          if (name && name.length > 1) {
            const link = rawHref.startsWith("http") ? rawHref : `${this.getBaseUrl()}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
            list.push({ name, imageUrl, link });
          }
        }
      }
    }

    let hasNextPage = false;
    const paginationLinks = doc.select("a");
    for (const pl of paginationLinks) {
      const txt = pl.text || "";
      const href = pl.getHref || pl.attr("href") || "";
      if ((txt.includes("Next") || txt.includes("»")) && href.includes("page=")) {
        hasNextPage = true;
        break;
      }
    }

    return { list, hasNextPage };
  }

  async getPopular(page) {
    const p = Math.max(1, parseInt(page) || 1);
    const url = `${this.getBaseUrl()}/search?q=&page=${p}&ext=epub&sort=`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.mangaListFromPage(res);
  }

  async getLatestUpdates(page) {
    const p = Math.max(1, parseInt(page) || 1);
    const url = `${this.getBaseUrl()}/search?q=&page=${p}&ext=epub&sort=newest`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.mangaListFromPage(res);
  }

  async search(query, page, filters) {
    const p = Math.max(1, parseInt(page) || 1);
    let sortVal = "";
    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        if (f.type_name === "SelectFilter" && f.name === "Sort By" && f.values && f.values[f.state]) {
          sortVal = f.values[f.state].value;
        }
      }
    }

    const q = encodeURIComponent((query || "").trim());
    let url = `${this.getBaseUrl()}/search?q=${q}&page=${p}&ext=epub`;
    if (sortVal) url += `&sort=${sortVal}`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.mangaListFromPage(res);
  }

  async getDetail(url) {
    const client = new Client();
    const fullUrl = url.startsWith("http") ? url : `${this.getBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await client.get(fullUrl, this.getHeaders(fullUrl));
    const doc = new Document(res.body);

    const name = (doc.selectFirst("h1")?.text || 
                  doc.selectFirst("div.text-3xl")?.text || 
                  doc.selectFirst("meta[property='og:title']")?.attr("content") || 
                  "Unknown Title").trim();

    let description = "";
    const descEl = doc.selectFirst("#book-panel-overview p") || doc.selectFirst("div.mb-1");
    if (descEl) {
      description = descEl.text.trim().replace(/^description/i, "").trim();
    }
    if (!description) {
      description = doc.selectFirst("meta[property='og:description']")?.attr("content") || "";
    }

    let author = "";
    const authorEl = doc.selectFirst("a[href*='/search?q='][class*='custom-a']") || doc.selectFirst("div.italic");
    if (authorEl) {
      author = authorEl.text.replaceAll("🔍", "").trim();
    }

    const imgEl = doc.selectFirst("img");
    const imageUrl = imgEl ? (imgEl.getSrc || imgEl.attr("src") || "") : "";

    const status = 1; // Completed
    const genre = ["Novel", "Ebook"];

    // Extract book publication date/year
    let dateUpload = "1640995200000"; // 2022-01-01 default
    const ldJsonMatch = res.body.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (ldJsonMatch) {
      try {
        const ld = JSON.parse(ldJsonMatch[1]);
        const dp = ld.datePublished || ld.dateCreated || ld.dateModified;
        if (dp) {
          const ms = Date.parse(dp);
          if (!isNaN(ms)) dateUpload = ms.toString();
        }
      } catch (_) {}
    }
    if (dateUpload === "1640995200000") {
      const yearMatch = res.body.match(/Year:?\s*([12]\d{3})/i) || 
                        res.body.match(/datePublished"?\s*:\s*"([12]\d{3})/i) || 
                        res.body.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        const ms = Date.parse(`${yearMatch[1]}-01-01`);
        if (!isNaN(ms)) dateUpload = ms.toString();
      }
    }

    const md5Match = (fullUrl + res.body).match(/[a-f0-9]{32}/i);
    const md5 = md5Match ? md5Match[0] : "";

    let bookLink = null;
    const accountKey = this.getAccountKey();

    if (accountKey && md5) {
      try {
        const fastApiUrl = `${this.getBaseUrl()}/dyn/api/fast_download.json?key=${accountKey}&md5=${md5}`;
        const apiRes = await client.get(fastApiUrl, this.getHeaders(fastApiUrl));
        const apiData = JSON.parse(apiRes.body);
        if (apiData?.download_url) {
          bookLink = apiData.download_url;
        }
      } catch (_) {}
    }

    if (!bookLink) {
      bookLink = await this._resolveDownloadLink(client, doc, fullUrl);
    }

    const chapters = [];
    if (bookLink) {
      try {
        const book = await parseEpub(name, bookLink, {
          Connection: "Keep-Alive",
          ...this.getHeaders(bookLink),
        });
        if (book) {
          if (!author && book.author) author = book.author;
          if (Array.isArray(book.chapters)) {
            for (const chapterTitle of book.chapters) {
              chapters.push({
                name: chapterTitle,
                url: bookLink + ";;;" + chapterTitle,
                dateUpload: dateUpload,
                scanlator: author || "Anna's Archive",
              });
            }
          }
        }
      } catch (_) {}
    }

    if (chapters.length === 0) {
      chapters.push({
        name: "Open in WebView to solve verification or enter Member Key in Settings",
        url: fullUrl + ";;;info",
        dateUpload: dateUpload,
        scanlator: "Notice"
      });
    }

    return {
      description,
      imageUrl,
      author,
      genre,
      status,
      chapters
    };
  }

  async _resolveDownloadLink(client, doc, pageUrl) {
    const anchors = doc.select("a");
    for (const a of anchors) {
      const href = a.getHref || a.attr("href") || "";
      if (!href) continue;

      if (href.endsWith(".epub") && href.startsWith("http")) {
        return href;
      }

      if (href.includes("libgen.li") || href.includes("libgen.rs") || href.includes("books.ms") || href.includes("libgen.is")) {
        const resolved = await this._resolveLibgen(client, href);
        if (resolved) return resolved;
      }

      if (href.includes("ipfs.io") || href.includes("cloudflare-ipfs.com") || href.includes("pinata.cloud")) {
        return href;
      }
    }
    return null;
  }

  async _resolveLibgen(client, mirrorLink) {
    try {
      const headers = this.getHeaders(mirrorLink);
      const res = await client.get(mirrorLink, headers);
      const doc = new Document(res.body);
      const links = doc.select("a");
      for (const l of links) {
        const href = l.getHref || l.attr("href") || "";
        if (href.includes("get.php") || href.endsWith(".epub")) {
          return href.startsWith("http") ? href : new URL(href, mirrorLink).href;
        }
      }
    } catch (_) {}
    return null;
  }

  async getHtmlContent(name, url) {
    const parts = url.split(";;;");
    const bookLink = parts[0];
    const chapterTitle = parts[1] || "";

    if (chapterTitle === "info" || !bookLink.startsWith("http")) {
      return `<html><body><h3>Anna's Archive Notice</h3><p>To read EPUB chapters that require verification or membership, open this book in Mangayomi's WebView (globe icon) to solve the security check or log into your account. If you have an Anna's Archive account key, enter it in Extension Settings.</p></body></html>`;
    }

    return await parseEpubChapter(
      name,
      bookLink,
      {
        Connection: "Keep-Alive",
        ...this.getHeaders(bookLink),
      },
      chapterTitle
    );
  }

  async cleanHtmlContent(html) {
    return html;
  }

  getFilterList() {
    return [
      {
        type_name: "SelectFilter",
        name: "Sort By",
        state: 0,
        values: [
          { type_name: "SelectOption", name: "Most Relevant", value: "" },
          { type_name: "SelectOption", name: "Newest", value: "newest" },
          { type_name: "SelectOption", name: "Oldest", value: "oldest" },
          { type_name: "SelectOption", name: "Largest", value: "largest" },
          { type_name: "SelectOption", name: "Smallest", value: "smallest" }
        ]
      }
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "override_base_url",
        editTextPreference: {
          title: "Override Base URL",
          summary: "Default: https://annas-archive.is (Alternatives: https://annas-archive.li, https://annas-archive.se)",
          value: "https://annas-archive.is",
          dialogTitle: "Anna's Archive Mirror URL",
          dialogMessage: "Enter active mirror URL"
        }
      },
      {
        key: "account_key",
        editTextPreference: {
          title: "Account Secret Key / Member Key",
          summary: "Optional: Secret key from your Anna's Archive account for direct fast downloads",
          value: "",
          dialogTitle: "Account Secret Key",
          dialogMessage: "Enter your account key"
        }
      }
    ];
  }
}
