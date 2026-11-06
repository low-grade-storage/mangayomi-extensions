const mangayomiSources = [{
"name": "J-Novel Club",
"lang": "en",
"baseUrl": "https://j-novel.club",
"apiUrl": "",
"iconUrl": "https://j-novel.club/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/j_novel_club.js",
"hasCloudflare": true,
"notes": "Official English translations of Japanese light novels and series"
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
};
}
async parseSeries(url, query) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const doc = new Document(res.body);
const bookList = [];
const seen = new Set();
const links = doc.select("a[href^='/series/']");
for (const a of links) {
let href = a.attr("href") || "";
if (!href || href === "/series" || href === "/series/") continue;
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const titleElem = a.selectFirst("h3") || a.selectFirst("h4") || a.selectFirst("div.title") || a;
let title = (titleElem ? titleElem.text : "").trim();
if (title.toLowerCase() === "novel" || title.toLowerCase() === "manga") {
const parent = a.parent;
if (parent) {
const siblingTitle = parent.selectFirst("h2, h3, h4, .title");
if (siblingTitle) title = siblingTitle.text.trim();
}
}
if (!title || title.toLowerCase() === "novel" || title.toLowerCase() === "manga") {
const slug = href.split("/").pop();
title = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
if (query && !title.toLowerCase().includes(query.toLowerCase())) {
continue;
}
const img = a.selectFirst("img") || a.parent?.selectFirst("img");
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
return { list: bookList, hasNextPage: false };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
return await this.parseSeries(`${this.source.baseUrl}/series`);
}
async getLatestUpdates(page) {
return await this.parseSeries(`${this.source.baseUrl}/series`);
}
async search(query, page, filters) {
return await this.parseSeries(`${this.source.baseUrl}/series`, query);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load series details (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown Title";
const imgElem = doc.selectFirst("img[src*='cover']") || doc.selectFirst("main img") || doc.selectFirst("img");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || imgElem.attr("data-src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst(".description") || doc.selectFirst("div.content p") || doc.selectFirst("main p");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst(".author") || doc.selectFirst(".creator");
const author = authorElem ? authorElem.text.trim() : "J-Novel Club";
const chapters = [];
const seenChapters = new Set();
const readLinks = doc.select("a[href^='/read/'], a[href^='/part/']");
for (const a of readLinks) {
let chHref = a.attr("href") || "";
if (!chHref) continue;
if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref}`;
if (seenChapters.has(chHref)) continue;
seenChapters.add(chHref);
let partTitle = a.text.trim();
if (!partTitle || partTitle.toLowerCase() === "preview" || partTitle.toLowerCase() === "read") {
const slug = chHref.split("/").pop();
partTitle = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
chapters.push({
name: partTitle,
url: chHref,
scanlator: "J-Novel Club"
});
}
return {
name,
link: url,
imageUrl,
description,
author,
genre: ["Light Novel", "Official Translation"],
status: 0,
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
const readerElem = doc.selectFirst("div.reader") || doc.selectFirst("article") || doc.selectFirst("main");
if (readerElem && readerElem.text.trim()) {
return readerElem.outerHtml;
}
const paragraphs = doc.select("p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty preview content or subscription required");
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