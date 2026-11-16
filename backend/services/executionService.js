import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const crawlerPath = path.resolve(here, "../crawler/website_crawler.py");

function interpretPrompt(prompt) {
  // Controlled intent parser: only the approved website-crawl action is executable.
  const match = prompt.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) throw new Error("Please include a public website URL, e.g. https://example.com.");
  const url = match[0].replace(/[),.;]+$/, "");
  return { intent: "website_crawl", url, wantsJson: /\b(json|structured|data)\b/i.test(prompt) };
}

function runCli(url) {
  return new Promise((resolve) => {
    const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const child = spawn(python, [crawlerPath, "--url", url, "--max-pages", "5"], {
      shell: false,
      windowsHide: true,
      cwd: path.resolve(here, "../.."),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });

    let stdout = "", stderr = "", settled = false;
    const started = Date.now();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, durationMs: Date.now() - started });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ exitCode: null, stdout, stderr: `${stderr}\nExecution timed out after 45 seconds.`.trim(), timedOut: true });
    }, 45000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
      if (stdout.length > 2_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", chunk => { stderr += chunk.slice(0, 20000); });
    child.on("error", error => finish({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}`, timedOut: false }));
    child.on("close", code => finish({ exitCode: code, stdout, stderr, timedOut: false }));
  });
}

function makeSummary(pages = []) {
  const lines = [];
  for (const page of pages) {
    if (page.title) lines.push(page.title);
    if (page.description) lines.push(page.description);
    const first = (page.text || "").split(/(?<=[.!?])\s+/).find(s => s.length > 35);
    if (first) lines.push(first);
  }
  return [...new Set(lines)].slice(0, 6).join(" ") || "The crawler did not find enough readable text to create a summary.";
}

export async function executeCrawlTask(prompt) {
  let task;
  try { task = interpretPrompt(prompt); }
  catch (error) { return { status: "FAILED", error: error.message }; }

  const cli = await runCli(task.url);
  if (cli.timedOut) return { status: "FAILED", error: "The crawler timed out.", execution: { cli: "Python website_crawler.py", ...cli, stdout: undefined } };

  let data;
  try { data = JSON.parse(cli.stdout); }
  catch {
    return { status: "FAILED", error: "Crawler did not return valid JSON.", execution: { cli: "Python website_crawler.py", exitCode: cli.exitCode, durationMs: cli.durationMs, stderr: cli.stderr, outputPreview: cli.stdout.slice(0, 1000) } };
  }

  if (cli.exitCode !== 0 || data.status !== "success") {
    return { status: "FAILED", error: data.error || "Crawler execution failed.", data, execution: { cli: "Python website_crawler.py", exitCode: cli.exitCode, durationMs: cli.durationMs, stderr: cli.stderr } };
  }

  const status = data.pages?.some(p => p.fetch_error) ? "PARTIAL" : "SUCCESS";
  return {
    status,
    intent: task.intent,
    summary: makeSummary(data.pages),
    data,
    execution: { cli: "Python website_crawler.py", exitCode: cli.exitCode, durationMs: cli.durationMs, stderr: cli.stderr }
  };
}
