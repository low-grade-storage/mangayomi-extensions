const mangayomiSources = [{
"name": "Scribble Hub",
"lang": "en",
"baseUrl": "https://www.scribblehub.com",
"apiUrl": "",
"iconUrl": "https://www.scribblehub.com/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/scribble_hub.js",
"hasCloudflare": true,
"notes": "Original web novels and stories from Scribble Hub"
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
};
}
async parseNovels(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const doc = new Document(res.body);
const bookList = [];
const seen = new Set();
const cards = doc.select(".search_main_box");
for (const card of cards) {
const a = card.selectFirst(".search_title > a") || card.selectFirst("a[href*='/series/']");
if (!a) continue;
let href = a.attr("href") || "";
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const title = a.text.trim();
if (!title) continue;
const img = card.selectFirst(".search_img > img") || card.selectFirst("img");
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
const nextBtn = doc.selectFirst("a.next, .pagination .next, a:contains('Next')");
const hasNextPage = nextBtn ? true : bookList.length >= 20;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const url = `${this.source.baseUrl}/series-finder/?sf=1&sort=ratings&order=desc&pg=${page}`;
return await this.parseNovels(url);
}
async getLatestUpdates(page) {
const url = `${this.source.baseUrl}/latest-series/?pg=${page}`;
return await this.parseNovels(url);
}
async search(query, page, filters) {
const url = `${this.source.baseUrl}/?s=${encodeURIComponent(query)}&post_type=fictionposts&paged=${page}`;
return await this.parseNovels(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load novel details (${res.statusCode})`);
}
const doc = new Document(res.body);
const titleElem = doc.selectFirst(".fic_title") || doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown";
const imgElem = doc.selectFirst(".fic_image img") || doc.selectFirst("div.novel-cover img");
let imageUrl = "";
if (imgElem) {
imageUrl = imgElem.attr("src") || imgElem.attr("data-src") || "";
if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
}
const descElem = doc.selectFirst(".wi_fic_desc") || doc.selectFirst("div.description");
const description = descElem ? descElem.text.trim() : "";
const authorElem = doc.selectFirst(".auth_name_fic") || doc.selectFirst("a[href*='/profile/']");
const author = authorElem ? authorElem.text.trim() : "";
const genres = [];
const genreElems = doc.select(".fic_genre");
for (const g of genreElems) {
const gt = g.text.trim();
if (gt && !genres.includes(gt)) genres.push(gt);
}
const statsElem = doc.selectFirst(".rnd_stats");
const statusText = statsElem ? statsElem.nextElementSibling.text.toLowerCase() : doc.text.toLowerCase();
const status = statusText.includes("ongoing") ? 0 : 1;
const postIdMatch = url.match(/\/series\/(\d+)/);
const postId = postIdMatch ? postIdMatch[1] : "";
const chapters = [];
if (postId) {
const ajaxUrl = `${this.source.baseUrl}/wp-admin/admin-ajax.php`;
const postBody = `action=wi_getreleases_pagination&pagenum=-1&mypostid=${postId}`;
const ajaxHeaders = {
...this.getHeaders(url),
"Content-Type": "application/x-www-form-urlencoded"
};
const ajaxRes = await client.post(ajaxUrl, ajaxHeaders, postBody);
if (ajaxRes.statusCode === 200) {
const cDoc = new Document(ajaxRes.body);
const tocItems = cDoc.select(".toc_w");
for (const item of tocItems) {
const a = item.selectFirst("a");
if (!a) continue;
let chHref = a.attr("href") || "";
if (!chHref) continue;
if (!chHref.startsWith("http")) chHref = `${this.source.baseUrl}${chHref}`;
const titleSpan = item.selectFirst(".toc_a") || a;
const chName = titleSpan.text.trim();
let dateUpload = null;
const dateElem = item.selectFirst(".fic_date_pub");
if (dateElem && dateElem.text) {
try {
const parsed = parseDates([dateElem.text.trim()], "yyyy-MM-dd", "en");
if (parsed && parsed.length > 0 && parsed[0]) {
dateUpload = parsed[0].toString();
}
} catch (_) {}
}
chapters.push({
name: chName,
url: chHref,
dateUpload: dateUpload,
scanlator: ""
});
}
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
chapters: chapters.reverse()
};
}
async getHtmlContent(name, url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load chapter (${res.statusCode})`);
}
const doc = new Document(res.body);
const content = doc.selectFirst("div.chp_raw") || doc.selectFirst("#chp_raw") || doc.selectFirst(".chapter-content");
if (content && content.text.trim()) {
return content.outerHtml;
}
const paragraphs = doc.select(".chp_raw p, #chp_raw p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty chapter content or blocked by Cloudflare");
}
async cleanHtmlContent(html) {
const doc = new Document(html);
const paragraphs = doc.select("p");
if (!paragraphs || paragraphs.length === 0) return html;
return paragraphs
.filter(p => !p.text.includes("scribblehub.com"))
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