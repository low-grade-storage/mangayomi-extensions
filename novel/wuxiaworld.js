const mangayomiSources = [{
"name": "Wuxiaworld",
"lang": "en",
"baseUrl": "https://www.wuxiaworld.com",
"apiUrl": "https://www.wuxiaworld.com/api",
"iconUrl": "https://www.wuxiaworld.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/wuxiaworld.js",
"hasCloudflare": true,
"notes": "Chinese, Korean, and English martial arts and fantasy light novels"
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
};
}
async parseNovelList(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const bookList = [];
const seen = new Set();
if (res.body.trim().startsWith("{") || res.body.trim().startsWith("[")) {
try {
const data = JSON.parse(res.body);
const items = data.items || data.novels || (Array.isArray(data) ? data : []);
for (const item of items) {
const name = item.name || item.title || "";
const slug = item.slug || item.id || "";
if (!name || !slug) continue;
const link = `${this.source.baseUrl}/novel/${slug}`;
if (seen.has(link)) continue;
seen.add(link);
const imageUrl = item.coverUrl || item.cover || "";
bookList.push({ name, link, imageUrl });
}
const hasNextPage = items.length >= 10;
return { list: bookList, hasNextPage };
} catch (_) {}
}
const doc = new Document(res.body);
const cards = doc.select(".novel-item, .media, div.novel-list-item, .search-item, div.flex.flex-col");
for (const card of cards) {
const a = card.selectFirst("a[href*='/novel/']");
if (!a) continue;
let href = a.attr("href") || "";
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const titleElem = card.selectFirst(".novel-title") || card.selectFirst("h4") || card.selectFirst("h3") || a;
const title = (titleElem ? titleElem.text : "").trim();
if (!title) continue;
const img = card.selectFirst("img");
let imgUrl = "";
if (img) {
imgUrl = img.attr("src") || img.attr("data-src") || "";
if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
}
bookList.push({
name: title,
link: href,
imageUrl: imgUrl
});
}
const hasNextPage = bookList.length >= 10;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/novels`;
return await this.parseNovelList(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/novels?sortType=Latest`;
return await this.parseNovelList(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/novels?search=${encodeURIComponent(query)}`;
return await this.parseNovelList(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load novel (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("h1") || doc.selectFirst(".novel-title") || doc.selectFirst("h2");
const name = titleElem ? titleElem.text.trim() : "Unknown";
const imgElem = doc.selectFirst("img.novel-cover") || doc.selectFirst(".media-left img") || doc.selectFirst("img[src*='cover']");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || imgElem.attr("data-src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst(".fr-view") || doc.selectFirst(".synopsis") || doc.selectFirst(".novel-body") || doc.selectFirst("div.content");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst(".author") || doc.selectFirst("dt:contains('Author') + dd") || doc.selectFirst("span.author");
const author = authorElem ? authorElem.text.trim() : "";
const genres = [];
const genreElems = doc.select(".genres a, .tags a, a[href*='/genre/']");
for (const g of genreElems) {
const gt = g.text.trim();
if (gt && !genres.includes(gt)) genres.push(gt);
}
const statusText = doc.text.toLowerCase();
const status = statusText.includes("completed") ? 1 : 0;
const chapters = [];
const chapterLinks = doc.select(".chapter-item a, .chapter-list a, .panel-group a, a[href*='/chapter']");
const seenChapters = new Set();
for (const a of chapterLinks) {
let href = a.attr("href") || "";
if (!href || href === "#") continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seenChapters.has(href)) continue;
seenChapters.add(href);
const chTitle = a.text.trim();
if (!chTitle) continue;
chapters.push({
name: chTitle,
url: href,
scanlator: ""
});
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
const content = doc.selectFirst("div.fr-view") || doc.selectFirst("div#chapter-content") || doc.selectFirst("div.chapter-content") || doc.selectFirst(".p-15");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select(".fr-view p, #chapter-content p, .chapter-content p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty chapter content");
}
async cleanHtmlContent(html) {
const doc = new Document(html);
const paragraphs = doc.select("p");
if (!paragraphs || paragraphs.length === 0) return html;
return paragraphs
.filter(p => !p.text.includes("wuxiaworld.com") && !p.text.includes("Find authorized novels"))
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