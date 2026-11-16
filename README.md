# TaskPilot AI

A chat-to-CLI website research prototype for BUILDSPRINT Round 2.

## What it does
1. Accepts a natural-language request containing a public website URL.
2. The Express backend interprets the request and starts an approved Python crawler using `child_process.spawn()` (no shell).
3. The crawler fetches a bounded number of same-domain pages, respects `robots.txt`, extracts page titles, descriptions, headings, text and links, and writes JSON to stdout.
4. The backend captures stdout, stderr, exit code and timeout status, validates the JSON, creates a short extractive summary, and returns the result to the chat UI.

## Stack
- React + Vite
- Node.js + Express
- Python + Requests + BeautifulSoup
- `child_process.spawn()` for real CLI execution

The intent layer in this MVP is deterministic/rule-based so the mandatory end-to-end execution works without an API key. An LLM can be added later for richer intent interpretation and summarization.

## Requirements
- Node.js 18+
- Python 3.10+
- pip

## Setup

### 1. Install crawler dependencies
From the project root:
```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r backend/crawler/requirements.txt
```

### 2. Install backend dependencies
```bash
cd backend
npm install
copy .env.example .env
npm run dev
```
On macOS/Linux use `cp .env.example .env` instead of `copy`.

If Python is not found by the backend, set `PYTHON_BIN` in `backend/.env` to the full path of your Python executable. On Windows this is often `C:\...\python.exe`; use forward slashes or escaped backslashes.

### 3. Install frontend dependencies
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL shown in the terminal (normally http://localhost:5173).

## Demo prompt
```text
Crawl https://example.com, extract the important information, summarize the website and return the extracted data in JSON.
```

## API
`POST http://localhost:5000/api/tasks/execute`

Request:
```json
{
  "prompt": "Crawl https://example.com and return a summary in JSON"
}
```

Response includes `status`, `summary`, `data`, `execution` (CLI, duration, exit code) and `stderr` when relevant.

## Security and limits
- The backend invokes a fixed Python script with an argument array and `shell: false`.
- Only HTTP(S) public URLs are accepted. Localhost, private, loopback, link-local and reserved IP destinations are blocked.
- Redirect destinations are revalidated by the crawler.
- The crawler is limited to five pages and same-host links, observes robots.txt, and applies request timeouts.
- Website text is treated as untrusted data; it is never executed as instructions or commands.
- Do not deploy this prototype as an unrestricted public URL fetcher without additional network-level egress controls, rate limiting, process isolation and monitoring.

## Known limitations
- The summary is extractive and intentionally simple; no LLM API is required.
- This is a bounded prototype, not a general-purpose browser agent.
- Some sites block automated requests, require JavaScript, or prohibit crawling. Use a site you are permitted to access.

## AI assistance disclosure
Add the name of the coding assistant and any AI APIs/services actually used during development/demo. Do not claim an LLM was used if it was not.
