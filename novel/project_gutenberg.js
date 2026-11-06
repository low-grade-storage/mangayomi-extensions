const mangayomiSources = [{
"name": "Project Gutenberg",
"lang": "en",
"baseUrl": "https://www.gutenberg.org",
"apiUrl": "",
"iconUrl": "https://www.gutenberg.org/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/project_gutenberg.js",
"hasCloudflare": false,
"notes": "Free public domain books and literary classics"
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
const items = doc.select("li.booklink");
for (const item of items) {
const a = item.selectFirst("a.link");
if (!a) continue;
let href = a.attr("href") || "";
if (!href.startsWith("http")) href = `${this.source.baseUrl}${href}`;
if (seen.has(href)) continue;
seen.add(href);
const titleElem = item.selectFirst("span.title");
const title = titleElem ? titleElem.text.trim() : "";
if (!title) continue;
const img = item.selectFirst("img.cover-thumb");
let imageUrl = "";
if (img) {
let src = img.attr("src") || "";
if (src.includes("small.jpg")) {
src = src.replace("small.jpg", "medium.jpg");
}
imageUrl = src.startsWith("http") ? src : `${this.source.baseUrl}${src}`;
}
bookList.push({
name: title,
link: href,
imageUrl: imageUrl
});
}
const nextElem = doc.selectFirst("a:contains('Next'), li.next a");
const hasNextPage = nextElem ? true : bookList.length >= 25;
return { list: bookList, hasNextPage };
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const startIndex = (page - 1) * 25 + 1;
const url = `${this.source.baseUrl}/ebooks/search/?sort_order=downloads&start_index=${startIndex}`;
return await this.parseBooks(url);
}
async getLatestUpdates(page) {
const startIndex = (page - 1) * 25 + 1;
const url = `${this.source.baseUrl}/ebooks/search/?sort_order=release_date&start_index=${startIndex}`;
return await this.parseBooks(url);
}
async search(query, page, filters) {
const startIndex = (page - 1) * 25 + 1;
const url = `${this.source.baseUrl}/ebooks/search/?query=${encodeURIComponent(query)}&start_index=${startIndex}`;
return await this.parseBooks(url);
}
async getDetail(url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load book (${res.statusCode})`);
}
const doc = new Document(res.body);
const idMatch = url.match(/\/ebooks\/(\d+)/);
const bookId = idMatch ? idMatch[1] : "";
const titleElem = doc.selectFirst("h1[itemprop='name']") || doc.selectFirst("h1");
const name = titleElem ? titleElem.text.trim() : "Unknown";
const authorElem = doc.selectFirst("a[itemprop='creator']") || doc.selectFirst("th:contains('Author') + td") || doc.selectFirst("td a[href*='/authors/']");
const author = authorElem ? authorElem.text.trim() : "";
const descElem = doc.selectFirst("td[property='dcterms:description']") || doc.selectFirst("#about_book_table");
const description = descElem ? descElem.text.trim() : `Project Gutenberg eBook #${bookId}`;
let imageUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.cover.medium.jpg`;
const genres = [];
const subjectElems = doc.select("a[href*='/ebooks/subject/']");
for (const s of subjectElems) {
const st = s.text.trim();
if (st && !genres.includes(st)) genres.push(st);
}
const readOnlineUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}-images.html`;
const chapters = [{
name: "Complete Book (Illustrated / Full Text)",
url: readOnlineUrl,
scanlator: "Project Gutenberg"
}];
return {
name,
link: url,
imageUrl,
description,
author,
genre: genres,
status: 1, // Public domain works are completed
chapters
};
}
async getHtmlContent(name, url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load book content (${res.statusCode})`);
}
const doc = new Document(res.body);
const content = doc.selectFirst("body");
if (!content || !content.text.trim()) {
throw new Error("Empty book content");
}
return content.outerHtml;
}
async cleanHtmlContent(html) {
const doc = new Document(html);
const paragraphs = doc.select("p");
if (!paragraphs || paragraphs.length === 0) return html;
return paragraphs
.filter(p => !p.text.includes("*** START OF THE PROJECT GUTENBERG") && !p.text.includes("*** END OF THE PROJECT GUTENBERG"))
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