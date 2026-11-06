const mangayomiSources = [{
"name": "Wattpad",
"lang": "en",
"baseUrl": "https://www.wattpad.com",
"apiUrl": "",
"iconUrl": "https://www.wattpad.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/wattpad.js",
"hasCloudflare": false,
"notes": "Wattpad community novel platform"
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
};
}
async parseStories(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const doc = new Document(res.body);
const bookList = [];
const seen = new Set();
const cards = doc.select(".story-card, .story-card-data, article.story-card");
for (const card of cards) {
const linkElem = card.selectFirst("a[href*='/story/']") || card.selectFirst("a.on-navigate") || card.selectFirst("a");
if (!linkElem) continue;
let href = linkElem.attr("href") || "";
if (!href.includes("/story/")) continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const titleElem = card.selectFirst(".title") || card.selectFirst(".story-info__title") || card.selectFirst("h5") || linkElem;
const title = (titleElem ? titleElem.text : "").trim();
if (!title) continue;
const imgElem = card.selectFirst("img[src*='cover']") || card.selectFirst(".cover img") || card.selectFirst("img");
let imgUrl = "";
if (imgElem) {
imgUrl = imgElem.attr("data-src") || imgElem.attr("src") || "";
if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
}
bookList.push({
name: title,
link: href,
imageUrl: imgUrl
});
}
const nextElem = doc.selectFirst("a[rel='next'], .pagination .next a, a.next-page");
const hasNextPage = nextElem ? (nextElem.attr("href") !== "" && nextElem.attr("href") !== "#") : bookList.length > 0;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/stories/all?page=${page}`;
return await this.parseStories(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/stories/featured?page=${page}`;
return await this.parseStories(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/search/${encodeURIComponent(query)}?page=${page}`;
return await this.parseStories(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load novel details (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("div.story-info h1") || doc.selectFirst("h1.story-info__title") || doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown Title";
const coverElem = doc.selectFirst("div.story-info img") || doc.selectFirst(".story-cover img") || doc.selectFirst("figure.cover img");
let imageUrl = "";
if (coverElem) {
imageUrl = coverElem.attr("data-src") || coverElem.attr("src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst("pre.story-description") || doc.selectFirst("h2.description") || doc.selectFirst(".story-info .description");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst("a.author-info__username") || doc.selectFirst(".story-info .author a") || doc.selectFirst("span.author");
const author = authorElem ? authorElem.text.trim() : "";
const genres = [];
const tagElems = doc.select(".tag-item a, .tag-items a, ul.tags li a");
for (const tag of tagElems) {
const t = tag.text.trim();
if (t && !genres.includes(t)) genres.push(t);
}
const statsElem = doc.selectFirst(".story-stats, .story-badges");
const statsText = statsElem ? statsElem.text.toLowerCase() : "";
const status = statsText.includes("complete") ? 1 : 0;
const chapters = [];
const partElements = doc.select(".story-parts ul li a, .table-of-contents ul li a, ul.story-parts li a");
for (const part of partElements) {
const titleSpan = part.selectFirst(".part-title") || part;
const partTitle = (titleSpan ? titleSpan.text : "").trim();
let partHref = part.attr("href") || "";
if (!partHref || partHref === "#") continue;
if (!partHref.startsWith("http")) partHref = `${this.source.baseUrl}${partHref}`;
let dateUpload = null;
const timeElem = part.selectFirst("time") || part.selectFirst("span.date");
if (timeElem) {
const dt = timeElem.attr("datetime");
if (dt) {
const ms = Date.parse(dt.includes("T") ? dt : dt.replace(" ", "T"));
if (!isNaN(ms)) dateUpload = ms.toString();
}
}
chapters.push({
name: partTitle || `Part ${chapters.length + 1}`,
url: partHref,
dateUpload: dateUpload,
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
const paragraphs = doc.select("p[data-p-id], .panel-reading p, .story-text p, pre");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
const contentElem = doc.selectFirst(".panel-reading") || doc.selectFirst(".story-text") || doc.selectFirst("article");
if (!contentElem || !contentElem.text.trim()) {
throw new Error("Empty chapter content or login required");
}
return contentElem.outerHtml;
}
async cleanHtmlContent(html) {
const doc = new Document(html);
const paragraphs = doc.select("p");
if (!paragraphs || paragraphs.length === 0) return html;
return paragraphs
.filter(p => !p.text.includes("wattpad.com/user/"))
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