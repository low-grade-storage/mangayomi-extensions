const mangayomiSources = [{
"name": "Fictionpress",
"lang": "en",
"baseUrl": "https://www.fictionpress.com",
"apiUrl": "",
"iconUrl": "https://www.fictionpress.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/fictionpress.js",
"hasCloudflare": true,
"notes": "Original fiction and creative writing community by FanFiction.Net"
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
const cards = doc.select(".z-list");
for (const card of cards) {
const a = card.selectFirst("a.stitle");
if (!a) continue;
let href = a.attr("href") || "";
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const title = a.text.trim();
if (!title) continue;
const img = card.selectFirst("img.cavatar");
let imageUrl = "";
if (img) {
imageUrl = img.attr("src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
bookList.push({
name: title,
link: href,
imageUrl: imageUrl
});
}
const nextBtn = doc.selectFirst("center a:contains('Next')") || doc.selectFirst("a:contains('Next »')");
const hasNextPage = nextBtn ? true : bookList.length >= 25;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/browse/?&sort=1&p=${page}`;
return await this.parseStories(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/browse/?&sort=2&p=${page}`;
return await this.parseStories(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/search/?keywords=${encodeURIComponent(query)}&ready=1&type=story&p=${page}`;
return await this.parseStories(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load story (${res.statusCode})`);
}
const doc = new Document(res.body);
const profileTop = doc.selectFirst("#profile_top");
const titleElem = profileTop ? profileTop.selectFirst("b.xcontrast_txt") : doc.selectFirst("b.xcontrast_txt");
const name = titleElem ? titleElem.text.trim() : "Unknown";
const authorElem = profileTop ? profileTop.selectFirst("a.xcontrast_txt[href^='/u/']") : doc.selectFirst("a[href^='/u/']");
const author = authorElem ? authorElem.text.trim() : "";
const descElem = profileTop ? profileTop.selectFirst("div.xcontrast_txt") : doc.selectFirst("div.z-indent");
const description = descElem ? descElem.text.trim() : "";
const imgElem = profileTop ? profileTop.selectFirst("img.cavatar") : doc.selectFirst("img.cavatar");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const xmetaElem = profileTop ? profileTop.selectFirst("span.xgray") : null;
const xmetaText = xmetaElem ? xmetaElem.text : "";
const status = xmetaText.toLowerCase().includes("status: complete") ? 1 : 0;
const chapters = [];
const selectElem = doc.selectFirst("select#chap_select");
const options = selectElem ? selectElem.select("option") : [];
const storyMatch = url.match(/\/s\/(\d+)/);
const storyId = storyMatch ? storyMatch[1] : "";
const pathParts = url.split("/");
const slug = pathParts.length > 5 ? pathParts[5] : "";
if (options && options.length > 0) {
for (const opt of options) {
const chNum = opt.attr("value");
const chTitle = opt.text.trim();
const chUrl = `${this.source.baseUrl}/s/${storyId}/${chNum}/${slug}`;
chapters.push({
name: chTitle || `Chapter ${chNum}`,
url: chUrl,
scanlator: ""
});
}
} else {
chapters.push({
name: "Chapter 1",
url: url,
scanlator: ""
});
}
return {
name,
link: url,
imageUrl,
description,
author,
genre: [],
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
const content = doc.selectFirst("div#storytext") || doc.selectFirst("div.storytext");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select("#storytext p, .storytext p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty story text or Cloudflare challenge required");
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