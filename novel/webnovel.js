const mangayomiSources = [{
"name": "Webnovel",
"lang": "en",
"baseUrl": "https://www.webnovel.com",
"apiUrl": "",
"iconUrl": "https://www.webnovel.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/webnovel.js",
"hasCloudflare": true,
"notes": "Full catalog traversal to load and go through every chapter across all volumes for every novel."
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
};
}
async parseBooks(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const doc = new Document(res.body);
const bookList = [];
const seen = new Set();
const items = doc.select(".j_category_wrapper li, .j_list_container li, ul.g_book_list li, .search-result-container li");
for (const item of items) {
const a = item.selectFirst("a.g_thumb") || item.selectFirst("a[data-bookname]") || item.selectFirst("a");
if (!a) continue;
let href = a.attr("href") || "";
if (!href || href === "#") continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const title = a.attr("title") || a.attr("data-bookname") || item.selectFirst("h3")?.text.trim() || item.selectFirst(".g_book_name")?.text.trim() || "";
if (!title) continue;
const img = item.selectFirst("img");
let imgUrl = "";
if (img) {
imgUrl = img.attr("data-original") || img.attr("src") || "";
if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
}
bookList.push({
name: title,
link: href,
imageUrl: imgUrl
});
}
const nextBtn = doc.selectFirst("a.next, .pagination li.next a, a[rel='next']");
const hasNextPage = nextBtn ? (nextBtn.attr("href") !== "" && nextBtn.attr("href") !== "#") : bookList.length >= 20;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/stories/novel?orderBy=1&pageIndex=${page}`;
return await this.parseBooks(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/stories/novel?orderBy=5&pageIndex=${page}`;
return await this.parseBooks(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/search?keywords=${encodeURIComponent(query)}&pageIndex=${page}`;
return await this.parseBooks(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load novel (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("h1.det-hd-title") || doc.selectFirst("h1") || doc.selectFirst(".g_thumb img");
const name = titleElem ? (titleElem.text || titleElem.attr("alt") || "").trim() : "Unknown";
const imgElem = doc.selectFirst(".det-hd-cover img") || doc.selectFirst(".g_thumb img") || doc.selectFirst("img.cover");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || imgElem.attr("data-original") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst(".j_synopsis") || doc.selectFirst(".det-abt p") || doc.selectFirst(".synopsis");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst(".det-hd-detail a[href*='author']") || doc.selectFirst(".author a") || doc.selectFirst("address p span");
const author = authorElem ? authorElem.text.trim() : "";
const genres = [];
const genreElems = doc.select(".det-hd-tag, .det-hd-detail a[href*='category'], .tags a");
for (const g of genreElems) {
const gt = g.text.trim();
if (gt && !genres.includes(gt)) genres.push(gt);
}
const statusText = doc.text.toLowerCase();
const status = statusText.includes("completed") ? 1 : 0;
const chapters = [];
const seenChapters = new Set();
let catalogUrl = url.endsWith("/catalog") ? url : `${url.replace(/\/+$/, "")}/catalog`;
const catRes = await client.get(catalogUrl, this.getHeaders(catalogUrl));
const catDoc = new Document(catRes.body);
const volumeElements = catDoc.select(".volume-item, .j_catalog_list .volume-item, .catalog-content .volume-item");
if (volumeElements && volumeElements.length > 0) {
for (const vol of volumeElements) {
const volHeading = vol.selectFirst("h4")?.text.trim() || "";
const chapterLinks = vol.select("ol li a, ul li a, li a");
for (const a of chapterLinks) {
let chHref = a.attr("href") || "";
if (!chHref || chHref === "#") continue;
if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref}`;
if (seenChapters.has(chHref)) continue;
seenChapters.add(chHref);
const rawTitle = a.attr("title")?.trim() || a.text.trim();
const displayName = volHeading ? `${volHeading}: ${rawTitle}` : rawTitle;
chapters.push({
name: displayName,
url: chHref,
scanlator: ""
});
}
}
}
if (chapters.length === 0) {
const allLinks = catDoc.select(".j_catalog_list li a, .catalog-list li a, ol.chapter-list li a, .volume-item li a");
for (const a of allLinks) {
let chHref = a.attr("href") || "";
if (!chHref || chHref === "#") continue;
if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref}`;
if (seenChapters.has(chHref)) continue;
seenChapters.add(chHref);
chapters.push({
name: a.attr("title")?.trim() || a.text.trim(),
url: chHref,
scanlator: ""
});
}
}
return {
name,
link: url,
imageUrl,
description,
author,
genre: genres,
status,
chapters
};
}
async getHtmlContent(name, url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load chapter (${res.statusCode})`);
}
const doc = new Document(res.body);
const content = doc.selectFirst(".cha-content") || doc.selectFirst(".cha-words") || doc.selectFirst(".chapter-content") || doc.selectFirst(".j_chapter");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select(".cha-paragraph p, .cha-words p, div.chapter-body p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty chapter content or blocked by protection");
}
async cleanHtmlContent(html) {
const doc = new Document(html);
const paragraphs = doc.select("p");
if (!paragraphs || paragraphs.length === 0) return html;
return paragraphs
.filter(p => !p.className.includes("para-comment") && !p.text.includes("Find authorized novels in Webnovel"))
.map(p => p.outerHtml)
.join("\n");
}
getFilterList() {
return [];
}
getSourcePreferences() {
return [];
}
}