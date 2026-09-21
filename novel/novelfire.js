const mangayomiSources = [{"name":"NovelFire","lang":"en","baseUrl":"https://novelfire.net","apiUrl":"","iconUrl":"https://m.media-amazon.com/images/I/31957gKv8WL.jpg","typeSource":"single","itemType":2,"version":"0.0.2","pkgPath":"novel/src/en/novelfire.js","notes":""}];

class DefaultExtension extends MProvider {
    getHeaders(url) { return { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" }; }
    async getBooks(url) {
        const res = await new Client().get(url, this.getHeaders(url)), doc = new Document(res.body);
        const list = doc.select('ul.novel-list li.novel-item').map(b => {
            const a = b.selectFirst('a'), img = b.selectFirst('figure.novel-cover img');
            const src = img.attr("data-src") || img.attr("src");
            return { name: a.attr("title"), link: `${this.source.baseUrl}${a.attr("href")}`, imageUrl: src.startsWith('http') ? src : `${this.source.baseUrl}${src}` };
        });
        const next = doc.selectFirst("ul.pagination li.page-item:last-child a")?.attr("href");
        return { list, hasNextPage: !!next && next !== "#" && next !== url };
    }
    get supportsLatest() { return true; }
    async getPopular(page) { return this.getBooks(`${this.source.baseUrl}/genre-all/sort-popular/status-all/all-novel?page=${page}`); }
    async getLatestUpdates(page) { return this.getBooks(`${this.source.baseUrl}/latest-release-novels?page=${page}`); }
    async search(query, page) { return this.getBooks(`${this.source.baseUrl}/search?keyword=${query}&type=both&page=${page}`); }
    async getDetail(url) {
        const client = new Client(), res = await client.get(url, this.getHeaders(url)), doc = new Document(res.body);
        const name = doc.selectFirst("div.main-head h1.novel-title").text, imageUrl = doc.selectFirst("figure.cover img").attr("src");
        const description = doc.selectFirst('meta[itemprop="description"]').attr("content"), author = doc.selectFirst('span[itemprop="author"]').text;
        const kw = doc.selectFirst('meta[itemprop="keywords"]')?.attr("content");
        const genre = kw ? kw.split(',').map(g => g.trim()).filter(g => !['novel', 'webnovel'].includes(g.toLowerCase())) : [];
        const status = doc.selectFirst("div.header-stats span strong").text.toLowerCase().includes("ongoing") ? 1 : 0;
        let chaptersUrl = `${url}/chapters`, chapters = [];
        while (chaptersUrl) {
            const cDoc = new Document((await client.get(chaptersUrl, this.getHeaders(chaptersUrl))).body);
            for (const el of cDoc.select("ul.chapter-list li a")) {
                chapters.push({ name: el.selectFirst("strong.chapter-title").text.trim(), url: `${url}/chapter-${el.selectFirst("span.chapter-no").text}`, scanlator: "" });
            }
            const next = cDoc.selectFirst("ul.pagination li.page-item a[rel='next']")?.attr("href");
            chaptersUrl = (next && next !== "#" && next !== chaptersUrl) ? (next.startsWith('http') ? next : `${this.source.baseUrl}${next}`) : null;
        }
        return { name, link: url, imageUrl, description, author, genre, status, chapters: chapters.reverse() };
    }
    async getHtmlContent(name, url) {
        const res = await new Client().get(url, this.getHeaders(url));
        if (res.statusCode !== 200) throw new Error(`Failed to load chapter (${res.statusCode})`);
        const c = new Document(res.body).selectFirst("div#content") || new Document(res.body).selectFirst("div.chapter-content");
        if (!c || !c.text.trim()) throw new Error("Empty chapter content or blocked by protection");
        return c.outerHtml;
    }
    async cleanHtmlContent(html) {
        const content = new Document(html).selectFirst("div#content");
        return content ? content.select("p").filter(p => !p.text.includes("Translator:") && !p.text.includes("Editor:")).map(p => p.outerHtml).join("") : html;
    }
    getFilterList() { throw new Error("getFilterList not implemented"); }
    getSourcePreferences() { throw new Error("getSourcePreferences not implemented"); }
}
