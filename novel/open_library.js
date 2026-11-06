const mangayomiSources = [{
"name": "Open Library",
"lang": "en",
"baseUrl": "https://openlibrary.org",
"apiUrl": "https://openlibrary.org",
"iconUrl": "https://openlibrary.org/favicon.ico",
"typeSource": "single",
"itemType": 2,
"version": "0.0.1",
"pkgPath": "novel/src/en/open_library.js",
"hasCloudflare": false,
"notes": "Open, editable library catalog by Internet Archive with millions of book records"
}];
class DefaultExtension extends MProvider {
getHeaders(url) {
return {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
"Referer": `${this.source.baseUrl}/`,
"Accept": "application/json, text/html, */*"
};
}
get supportsLatest() {
return true;
}
async getPopular(page) {
const client = new Client();
const url = `${this.source.baseUrl}/trending/daily.json?page=${page}`;
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const data = JSON.parse(res.body);
const works = data.works || [];
const bookList = [];
for (const w of works) {
const title = w.title || "";
const key = w.key || "";
if (!title || !key) continue;
const coverId = w.cover_i;
const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";
bookList.push({
name: title,
link: `${this.source.baseUrl}${key}`,
imageUrl: imageUrl
});
}
return { list: bookList, hasNextPage: works.length >= 20 };
}
async getLatestUpdates(page) {
const client = new Client();
const offset = (page - 1) * 20;
const url = `${this.source.baseUrl}/subjects/fiction.json?sort=new&limit=20&offset=${offset}`;
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const data = JSON.parse(res.body);
const works = data.works || [];
const bookList = [];
for (const w of works) {
const title = w.title || "";
const key = w.key || "";
if (!title || !key) continue;
const coverId = w.cover_id || w.cover_i;
const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";
bookList.push({
name: title,
link: `${this.source.baseUrl}${key}`,
imageUrl: imageUrl
});
}
return { list: bookList, hasNextPage: works.length >= 20 };
}
async search(query, page, filters) {
const client = new Client();
const url = `${this.source.baseUrl}/search.json?q=${encodeURIComponent(query)}&page=${page}&limit=20`;
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
return { list: [], hasNextPage: false };
}
const data = JSON.parse(res.body);
const docs = data.docs || [];
const bookList = [];
for (const d of docs) {
const title = d.title || "";
const key = d.key || "";
if (!title || !key) continue;
const coverId = d.cover_i;
const imageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";
bookList.push({
name: title,
link: `${this.source.baseUrl}${key}`,
imageUrl: imageUrl
});
}
const numFound = data.numFound || data.num_found || 0;
const hasNextPage = page * 20 < numFound;
return { list: bookList, hasNextPage };
}
async getDetail(url) {
const client = new Client();
const jsonUrl = url.endsWith(".json") ? url : `${url.replace(/\/+$/, "")}.json`;
const res = await client.get(jsonUrl, this.getHeaders(jsonUrl));
if (res.statusCode !== 200) {
throw new Error(`Failed to load work data (${res.statusCode})`);
}
const data = JSON.parse(res.body);
const name = data.title || "Unknown Title";
let description = "";
if (typeof data.description === "string") {
description = data.description;
} else if (data.description && typeof data.description.value === "string") {
description = data.description.value;
}
let imageUrl = "";
if (data.covers && data.covers.length > 0 && data.covers[0] > 0) {
imageUrl = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
}
const genres = Array.isArray(data.subjects) ? data.subjects.slice(0, 10) : [];
let author = "";
if (Array.isArray(data.authors) && data.authors.length > 0) {
const authorKey = data.authors[0].author?.key;
if (authorKey) {
try {
const authorRes = await client.get(`${this.source.baseUrl}${authorKey}.json`, this.getHeaders(""));
if (authorRes.statusCode === 200) {
const authorData = JSON.parse(authorRes.body);
author = authorData.name || "";
}
} catch (_) {}
}
}
const workKey = data.key || url.replace(this.source.baseUrl, "");
const chapters = [{
name: "Read Book Online (Open Library Edition)",
url: `${this.source.baseUrl}${workKey}`,
scanlator: "Open Library"
}];
return {
name,
link: `${this.source.baseUrl}${workKey}`,
imageUrl,
description,
author,
genre: genres,
status: 1, // Archived works are completed
chapters
};
}
async getHtmlContent(name, url) {
const client = new Client();
const res = await client.get(url, this.getHeaders(url));
if (res.statusCode !== 200) {
throw new Error(`Failed to load book reader (${res.statusCode})`);
}
const doc = new Document(res.body);
const readContent = doc.selectFirst(".work-description") || doc.selectFirst(".edition-content") || doc.selectFirst("main");
if (readContent && readContent.text.trim()) {
return readContent.outerHtml;
}
const paragraphs = doc.select("p");
if (paragraphs && paragraphs.length > 0) {
return paragraphs.map(p => p.outerHtml).join("\n");
}
throw new Error("Empty content");
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