import argparse
import ipaddress
import json
import socket
import sys
import time
from collections import deque
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

USER_AGENT = "TaskPilotResearchBot/1.0 (+educational prototype)"
MAX_TEXT_CHARS = 12000
REQUEST_TIMEOUT = 10

def is_public_ip(ip_text):
    ip = ipaddress.ip_address(ip_text)
    return ip.is_global

def validate_public_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Only absolute HTTP or HTTPS URLs are accepted.")
    if parsed.username or parsed.password:
        raise ValueError("URLs containing credentials are not accepted.")
    host = parsed.hostname.rstrip(".").lower()
    if host in ("localhost",) or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError("Local and internal hostnames are blocked.")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError("The hostname could not be resolved.")
    if not addresses or any(not is_public_ip(item[4][0]) for item in addresses):
        raise ValueError("Private, local, reserved or non-public network destinations are blocked.")
    return url

def safe_get(session, url):
    current = url
    for _ in range(6):
        validate_public_url(current)
        response = session.get(current, timeout=REQUEST_TIMEOUT, allow_redirects=False, headers={"User-Agent": USER_AGENT})
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise requests.RequestException("Redirect response did not include a location.")
            current = urljoin(current, location)
            continue
        response.raise_for_status()
        return response
    raise requests.RequestException("Too many redirects.")

def get_robot_parser(session, base_url):
    parsed = urlparse(base_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        response = safe_get(session, robots_url)
        parser.parse(response.text.splitlines())
        response.close()
    except requests.HTTPError as exc:
        # RFC 9309: a 4xx robots.txt response means the crawler may access resources.
        # 5xx/server/network failures are treated conservatively as disallow.
        if exc.response is not None and 400 <= exc.response.status_code < 500:
            parser.parse(["User-agent: *", "Allow: /"])
        else:
            parser.parse(["User-agent: *", "Disallow: /"])
    except Exception:
        parser.parse(["User-agent: *", "Disallow: /"])
    return parser

def extract_page(session, url):
    response = safe_get(session, url)
    content_type = response.headers.get("Content-Type", "")
    if "text/html" not in content_type.lower():
        response.close()
        raise ValueError("URL did not return an HTML page.")
    final_url = response.url
    soup = BeautifulSoup(response.text, "html.parser")
    response.close()
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    description_tag = soup.find("meta", attrs={"name": "description"})
    description = description_tag.get("content", "").strip() if description_tag else ""
    headings = [h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2", "h3"])][:30]
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all(["p", "li"]) if p.get_text(" ", strip=True)]
    text = " ".join(paragraphs)[:MAX_TEXT_CHARS]
    links = []
    for a in soup.find_all("a", href=True):
        absolute = urldefrag(urljoin(final_url, a["href"])).url
        parsed = urlparse(absolute)
        if parsed.scheme in ("http", "https"):
            links.append({"text": a.get_text(" ", strip=True)[:200], "url": absolute})
    return {
        "url": final_url, "title": title, "description": description,
        "headings": headings, "text": text, "links": links[:100]
    }

def crawl(start_url, max_pages):
    validate_public_url(start_url)
    session = requests.Session()
    robots = get_robot_parser(session, start_url)
    start_host = urlparse(start_url).hostname.lower()
    queue = deque([(start_url, 0)])
    visited, pages = set(), []
    while queue and len(pages) < max_pages:
        url, depth = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        if not robots.can_fetch(USER_AGENT, url):
            pages.append({"url": url, "fetch_error": "Disallowed by robots.txt"})
            continue
        try:
            page = extract_page(session, url)
            pages.append(page)
            if depth < 1:
                for link in page["links"]:
                    candidate = link["url"]
                    parsed = urlparse(candidate)
                    if parsed.hostname and parsed.hostname.lower() == start_host and candidate not in visited:
                        queue.append((candidate, depth + 1))
        except Exception as exc:
            pages.append({"url": url, "fetch_error": str(exc)[:300]})
    return {
        "status": "success" if any("fetch_error" not in p for p in pages) else "failed",
        "start_url": start_url,
        "pages_crawled": sum("fetch_error" not in p for p in pages),
        "page_limit": max_pages,
        "pages": pages
    }

def main():
    parser = argparse.ArgumentParser(description="Bounded public website crawler")
    parser.add_argument("--url", required=True)
    parser.add_argument("--max-pages", type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 5:
        raise ValueError("max-pages must be between 1 and 5.")
    result = crawl(args.url, args.max_pages)
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] != "success":
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}), file=sys.stdout)
        print(str(exc), file=sys.stderr)
        sys.exit(1)
