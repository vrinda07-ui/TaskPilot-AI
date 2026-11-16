import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { executeCrawlTask } from "./services/executionService.js";

dotenv.config();
const app = express();
app.use(cors({ origin: ["http://localhost:5173"], methods: ["GET", "POST"] }));
app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "TaskPilot API" }));

app.post("/api/tasks/execute", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 2000) {
    return res.status(400).json({ status: "FAILED", error: "Enter a task (maximum 2000 characters)." });
  }
  try {
    const result = await executeCrawlTask(prompt);
    return res.status(result.status === "FAILED" ? 422 : 200).json(result);
  } catch (error) {
    console.error("Task execution error:", error.message);
    return res.status(500).json({ status: "FAILED", error: "Unexpected server error." });
  }
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`TaskPilot API listening on http://localhost:${port}`));
