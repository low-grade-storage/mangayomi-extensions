const mangayomiSources = [{
"name": "Baen Books",
"lang": "en",
"baseUrl": "https://www.baen.com",
"apiUrl": "",
"iconUrl": "https://www.baen.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/baen_books.js",
"hasCloudflare": false,
"notes": "Baen Free Library science fiction and fantasy publications"
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
const items = doc.select(".product-item, .product-item-info, div.category-products li.item, .search.results li.item");
for (const item of items) {
const a = item.selectFirst("a.product-item-link") || item.selectFirst("a[href*='.html']");
if (!a) continue;
let href = a.attr("href") || "";
if (!href.endsWith(".html")) continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const title = a.text.trim();
if (!title || title.toLowerCase() === "more...") continue;
const img = item.selectFirst("img.product-image-photo") || item.selectFirst("img");
let imageUrl = "";
if (img) {
imageUrl = img.attr("src") || img.attr("data-src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
bookList.push({
name: title,
link: href,
imageUrl: imageUrl
});
}
const nextBtn = doc.selectFirst("li.pages-item-next a, a.next, a[title='Next']");
const hasNextPage = nextBtn ? true : bookList.length >= 12;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/allbooks/category/index/id/2012?p=${page}`;
return await this.parseBooks(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/allbooks/category/index/id/2012?dir=desc&order=created_at&p=${page}`;
return await this.parseBooks(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}&p=${page}`;
return await this.parseBooks(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load book details (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("h1.page-title span") || doc.selectFirst("h1.page-title") || doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown Title";
const imgElem = doc.selectFirst("img.gallery-placeholder__image") || doc.selectFirst(".fotorama__img") || doc.selectFirst("img[src*='catalog/product']");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst(".product.attribute.overview") || doc.selectFirst(".product.attribute.description") || doc.selectFirst("div.description");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst("div.product-info-stock-sku") || doc.selectFirst(".author a") || doc.selectFirst(".author");
const author = authorElem ? authorElem.text.trim() : "Baen Books";
const chapters = [];
const readOnlineElem = doc.selectFirst("a[href*='/readonline/']");
if (readOnlineElem) {
let readUrl = readOnlineElem.attr("href") || "";
if (!readUrl.startsWith("http")) readUrl = `${this.source.baseUrl}${readUrl}`;
const roRes = await client.get(readUrl, this.getHeaders(readUrl));
if (roRes.statusCode === 200) {
const roDoc = new Document(roRes.body);
const chapterLinks = roDoc.select("a[href*='chapter=']");
const seenChapters = new Set();
for (const a of chapterLinks) {
let chHref = a.attr("href") || "";
if (!chHref) continue;
if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref}`;
if (seenChapters.has(chHref)) continue;
seenChapters.add(chHref);
const match = chHref.match(/chapter=(\d+)/);
const chNum = match ? match[1] : a.text.trim();
const chTitle = `Chapter ${chNum}`;
chapters.push({
name: chTitle,
url: chHref,
scanlator: "Baen Free Library"
});
}
}
}
if (chapters.length === 0) {
chapters.push({
name: "Full Book (Read Online)",
url: readOnlineElem ? (readOnlineElem.attr("href").startsWith("http") ? readOnlineElem.attr("href") : `${this.source.baseUrl}${readOnlineElem.attr("href")}`) : url,
scanlator: "Baen Free Library"
});
}
return {
name,
link: url,
imageUrl,
description,
author,
genre: ["Science Fiction", "Fantasy"],
status: 1, // Baen books are published
chapters
};
}
async getHtmlContent(name, url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load chapter content (${res.statusCode})`);
}
const doc = new Document(res.body);
const content = doc.selectFirst("div#content") || doc.selectFirst("div.main-content") || doc.selectFirst("body");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select("p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty chapter text");
}
async cleanHtmlContent(html) {
return html;
}
getFilterList() {
return [];
}
getSourcePreferences() {
return [];
}
}