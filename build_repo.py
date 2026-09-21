# Mangayomi Custom Extensions Repo Builder
import os
import json
import argparse
import socket
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def build(username="low-grade-storage", repo_name="mangayomi-extensions", branch="main", local_ip=None):
    if local_ip:
        base_raw_url = f"http://{local_ip}:8080"
        repo_website = f"http://{local_ip}:8080"
    else:
        base_raw_url = f"https://raw.githubusercontent.com/{username}/{repo_name}/{branch}"
        repo_website = f"https://github.com/{username}/{repo_name}"

    sources = [
        # Anime (itemType: 1)
        {
            "id": 715754009,
            "name": "Torrentio Anime (Torrent / Debrid)",
            "baseUrl": "https://torrentio.strem.fun",
            "lang": "all",
            "typeSource": "torrent",
            "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.torrentio.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/anime/torrentio_anime.js",
            "apiUrl": "",
            "version": "0.0.3",
            "isManga": False,
            "itemType": 1,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 715754020,
            "name": "Torrentio Universal (Movies / TV / Anime)",
            "baseUrl": "https://torrentio.strem.fun",
            "lang": "all",
            "typeSource": "torrent",
            "iconUrl": "https://torrentio.strem.fun/images/logo_v1.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/anime/torrentio_universal.js",
            "apiUrl": "https://v3-cinemeta.strem.io",
            "version": "0.1.0",
            "isManga": False,
            "itemType": 1,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": "Universal streaming extension for Movies, TV Series, and Anime powered by Cinemeta catalog and Torrentio torrent/debrid streams."
        },

        # Manga (itemType: 0)
        {
            "id": 524070078,
            "name": "Asura Scans (Optimized)",
            "baseUrl": "https://asurascans.com",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/asura_scans.js",
            "apiUrl": "https://api.asurascans.com",
            "version": "0.2.15",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 371842104,
            "name": "Atsumaru",
            "baseUrl": "https://atsu.moe",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://atsu.moe/favicon.ico",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/atsumaru.js",
            "apiUrl": "https://atsu.moe",
            "version": "0.1.2",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 810342358,
            "name": "MangaDex",
            "baseUrl": "https://mangadex.org",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/javascript/icon/all.mangadex.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/mangadex.js",
            "apiUrl": "https://api.mangadex.org",
            "version": "0.1.5",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 784920193,
            "name": "Thunder Scans",
            "baseUrl": "https://en-thunderscans.com",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://en-thunderscans.com/wp-content/uploads/2023/12/cropped-EN-TH-WEB-192x192.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/thunder_scans.js",
            "apiUrl": "",
            "version": "0.0.1",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 118325925,
            "name": "Webtoons (Optimized)",
            "baseUrl": "https://www.webtoons.com",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/0/09/Naver_Line_Webtoon_logo.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/webtoons.js",
            "apiUrl": "",
            "version": "0.0.50",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 693275080,
            "name": "Weeb Central",
            "baseUrl": "https://weebcentral.com",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://weebcentral.com",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/manga/weeb_central.js",
            "apiUrl": "",
            "version": "0.1.1",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },

        # Novel (itemType: 2)
        {
            "id": 114216145,
            "name": "Annas Archive",
            "baseUrl": "https://annas-archive.is",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.annasarchive.png",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": True,
            "sourceCodeUrl": f"{base_raw_url}/novel/annas_archive.js",
            "apiUrl": "",
            "version": "0.0.3",
            "isManga": False,
            "itemType": 2,
            "isFullData": False,
            "appMinVerReq": "0.6.1",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": "Downloads EPUB files to read chapters. Use WebView if Cloudflare/DDoS-Guard check is needed."
        },
        {
            "id": 918273645,
            "name": "NovelFire",
            "baseUrl": "https://novelfire.net",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://m.media-amazon.com/images/I/31957gKv8WL.jpg",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/novel/novelfire.js",
            "apiUrl": "",
            "version": "0.0.2",
            "isManga": False,
            "itemType": 2,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": ""
        },
        {
            "id": 834710192,
            "name": "Royal Road",
            "baseUrl": "https://royalroad.com",
            "lang": "en",
            "typeSource": "single",
            "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://royalroad.com",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": False,
            "hasCloudflare": False,
            "sourceCodeUrl": f"{base_raw_url}/novel/royalroad.js",
            "apiUrl": "",
            "version": "0.0.1",
            "isManga": False,
            "itemType": 2,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 0,
            "notes": ""
        }
    ]

    # Write JSON files
    with open(os.path.join(BASE_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(sources, f, indent=2, ensure_ascii=False)

    anime_sources = [s for s in sources if s["itemType"] == 1]
    with open(os.path.join(BASE_DIR, "anime_index.json"), "w", encoding="utf-8") as f:
        json.dump(anime_sources, f, indent=2, ensure_ascii=False)

    manga_sources = [s for s in sources if s["itemType"] == 0]
    with open(os.path.join(BASE_DIR, "manga_index.json"), "w", encoding="utf-8") as f:
        json.dump(manga_sources, f, indent=2, ensure_ascii=False)

    novel_sources = [s for s in sources if s["itemType"] == 2]
    with open(os.path.join(BASE_DIR, "novel_index.json"), "w", encoding="utf-8") as f:
        json.dump(novel_sources, f, indent=2, ensure_ascii=False)

    display_name = "Custom Extensions"
    manga_url = f"{base_raw_url}/manga_index.json"
    anime_url = f"{base_raw_url}/anime_index.json"
    novel_url = f"{base_raw_url}/novel_index.json"

    mangayomi_uri = (
        f"mangayomi://add-repo?repo_name={urllib.parse.quote(display_name)}"
        f"&repo_url={urllib.parse.quote(repo_website, safe='')}"
        f"&manga_url={urllib.parse.quote(manga_url, safe='')}"
        f"&anime_url={urllib.parse.quote(anime_url, safe='')}"
        f"&novel_url={urllib.parse.quote(novel_url, safe='')}"
    )

    redirector_link = f"https://intradeus.github.io/http-protocol-redirector?r={urllib.parse.quote(mangayomi_uri, safe='')}"

    readme_content = f"""# Mangayomi Custom Extensions Repository

A unified extension catalogue containing custom anime, manga, and novel extensions for [Mangayomi](https://github.com/kodjodevf/mangayomi).

## 🚀 1-Click Install

Click the button below on your phone or PC browser to add the complete repository into Mangayomi:

[![Add All Extensions to Mangayomi](https://img.shields.io/badge/Mangayomi-Add%20Custom%20Extensions-blue?style=for-the-badge&logo=android)]({redirector_link})

*(Direct link: [Click here to add to Mangayomi]({redirector_link}))*

---

## 📋 Manual Setup

If you prefer to add the catalogues manually in Mangayomi (**More -> Settings -> Browse -> Extension Repositories**):

- **Manga Repository URL**:
  `
  {manga_url}
  `
- **Anime Repository URL**:
  `
  {anime_url}
  `
- **Novel Repository URL**:
  `
  {novel_url}
  `
- **Unified Catalog (All-in-One)**:
  `
  {base_raw_url}/index.json
  `

---

## 📦 Included Extensions

### Anime (2)
- **Torrentio Anime (Torrent / Debrid)** (v0.0.3)
- **Torrentio Universal (Movies / TV / Anime)** (v0.1.0)

### Manga (6)
- **Asura Scans (Optimized)** (v0.2.15)
- **Atsumaru** (v0.1.2)
- **MangaDex** (v0.1.5)
- **Thunder Scans** (v0.0.1)
- **Webtoons (Optimized)** (v0.0.50)
- **Weeb Central** (v0.1.1)

### Novel (3)
- **Annas Archive** (v0.0.3)
- **NovelFire** (v0.0.2)
- **Royal Road** (v0.0.1)
"""

    with open(os.path.join(BASE_DIR, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme_content)

    print(f"Generated successfully in: {BASE_DIR}")
    print(f"Base Raw URL: {base_raw_url}")
    print(f"Direct URI: {mangayomi_uri}")
    print(f"1-Click Link: {redirector_link}")
    return redirector_link

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", default="low-grade-storage")
    parser.add_argument("--repo", default="mangayomi-extensions")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()

    local_ip = get_local_ip() if args.local else None
    link = build(args.user, args.repo, args.branch, local_ip)

    if args.serve:
        os.chdir(BASE_DIR)
        port = 8080
        print(f"Serving HTTP on 0.0.0.0:{port} (LAN IP: http://{get_local_ip()}:{port})...")
        server = HTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
        server.serve_forever()
