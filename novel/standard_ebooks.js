const mangayomiSources = [{
"name": "Standard E-Books",
"lang": "en",
"baseUrl": "https://standardebooks.org",
"apiUrl": "",
"iconUrl": "https://standardebooks.org/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/standard_ebooks.js",
"hasCloudflare": false,
"notes": "Free and liberated ebooks, carefully produced for the true book lover"
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
const items = doc.select("ol li, article.ebook, li.ebook");
for (const item of items) {
const a = item.selectFirst("a[href^='/ebooks/']");
if (!a) continue;
let href = a.attr("href") || "";
if (!href || href === "/ebooks" || href === "/ebooks/") continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const titleElem = item.selectFirst("span[property='schema:name']") || item.selectFirst(".title") || item.selectFirst("p.title") || a;
const title = (titleElem ? titleElem.text : "").trim();
if (!title) continue;
const img = item.selectFirst("img");
let imageUrl = "";
if (img) {
imageUrl = img.attr("src") || img.attr("data-src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
}
bookList.push({
name: title,
link: href,
imageUrl: imageUrl
});
}
const nextElem = doc.selectFirst("a[rel='next'], a:contains('Next')");
const hasNextPage = nextElem ? true : bookList.length >= 24;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/ebooks?page=${page}&sort=popular`;
return await this.parseBooks(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/ebooks?page=${page}&sort=newest`;
return await this.parseBooks(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/ebooks?query=${encodeURIComponent(query)}&page=${page}`;
return await this.parseBooks(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load ebook details (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown Title";
const authorElem = doc.selectFirst("p.author") || doc.selectFirst("a.author") || doc.selectFirst("p[property='schema:author']");
const author = authorElem ? authorElem.text.trim() : "";
const descElem = doc.selectFirst("section#description") || doc.selectFirst("div.description") || doc.selectFirst("article#content");
const description = descElem ? descElem.text.trim() : "";
const imgElem = doc.selectFirst("img.cover") || doc.selectFirst("figure img") || doc.selectFirst("picture img");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
else if (imageUrl.startsWith("/")) imageUrl = `${this.source.baseUrl}${imageUrl}`;
}
const genres = [];
const genreElems = doc.select("a[href*='/subject/'], a[href*='/collection/']");
for (const g of genreElems) {
const gt = g.text.trim();
if (gt && !genres.includes(gt)) genres.push(gt);
}
const chapters = [];
const tocUrl = `${url.replace(/\/+$/, "")}/text`;
const tocRes = await client.get(tocUrl, this.getHeaders(tocUrl));
if (tocRes.statusCode === 200) {
const tocDoc = new Document(tocRes.body);
const chapterLinks = tocDoc.select("nav ol li a, section ol li a, ol li a");
const seen = new Set();
for (const a of chapterLinks) {
let href = a.attr("href") || "";
if (!href || href.startsWith("#")) continue;
if (!href.startsWith("http")) {
href = href.startsWith("/") ? `${this.source.baseUrl}${href}` : `${tocUrl}/${href.replace(/^text\//, "")}`;
}
if (seen.has(href)) continue;
seen.add(href);
const chTitle = a.text.trim();
if (!chTitle) continue;
chapters.push({
name: chTitle,
url: href,
scanlator: "Standard Ebooks"
});
}
}
if (chapters.length === 0) {
chapters.push({
name: "Full Text (Single Page)",
url: `${url.replace(/\/+$/, "")}/text/single-page`,
scanlator: "Standard Ebooks"
});
}
return {
name,
link: url,
imageUrl,
description,
author,
genre: genres,
status: 1, // Public domain editions are completed
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
const content = doc.selectFirst("article") || doc.selectFirst("section") || doc.selectFirst("main");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select("p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty chapter content");
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