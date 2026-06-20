#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

// Parse BIFROST_ALLOWED_DIRS environment variable to restrict filesystem access
const allowedDirsEnv = process.env.BIFROST_ALLOWED_DIRS || "";
const allowedDirs = allowedDirsEnv
  .split(process.platform === "win32" ? /[;,]/ : /[:,]/)
  .map(d => d.trim())
  .filter(d => d.length > 0)
  .map(d => {
    try {
      return fsSync.realpathSync(d);
    } catch {
      return path.resolve(d);
    }
  });

async function isPathAllowed(targetPath: string): Promise<boolean> {
  if (allowedDirs.length === 0) {
    return false;
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await fs.realpath(targetPath);
  } catch {
    resolvedTarget = path.resolve(targetPath);
  }
  const isWindows = process.platform === "win32";

  return allowedDirs.some((allowedDir) => {
    const targetToCheck = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const allowedToCheck = isWindows ? allowedDir.toLowerCase() : allowedDir;

    if (targetToCheck === allowedToCheck) {
      return true;
    }

    const prefix = allowedToCheck.endsWith(path.sep) ? allowedToCheck : allowedToCheck + path.sep;
    return targetToCheck.startsWith(prefix);
  });
}

function isSensitivePath(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];

  // Block sensitive directory names
  const hasSensitiveDir = parts.some(part => part === ".git" || part === ".ssh");
  if (hasSensitiveDir) {
    return true;
  }

  // Block sensitive files
  const lowerFileName = fileName.toLowerCase();
  if (
    lowerFileName === ".env" ||
    lowerFileName.startsWith(".env.") ||
    lowerFileName.endsWith(".pem") ||
    lowerFileName.includes("id_rsa") ||
    lowerFileName.includes("credentials")
  ) {
    return true;
  }

  return false;
}

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

async function isBinaryFile(filePath: string): Promise<boolean> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

const PLANS_DIR = path.join(os.homedir(), ".chatgpt_plans");
const server = new Server({ name: "bifrost", version: "1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "save_plan",
      description: "Save a project plan. MUST include 4 sections: Overview, Tech Stack, Folder Structure, Steps.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, content: { type: "string" } },
        required: ["name", "content"],
      },
    },
    {
      name: "get_plan",
      description: "Get the project plan to write code.",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
    {
      name: "read_file",
      description: "Read ANY local file content (e.g., to audit code).",
      inputSchema: { type: "object", properties: { path: { type: "string", description: "Absolute path to the file" } }, required: ["path"] },
    },
    {
      name: "list_dir",
      description: "List files in a directory to explore the workspace.",
      inputSchema: { type: "object", properties: { path: { type: "string", description: "Absolute path to the directory" } }, required: ["path"] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === "list_dir") {
      const dirPath = args?.path;
      if (typeof dirPath !== "string") {
        throw new Error("Path must be a string");
      }
      
      const allowed = await isPathAllowed(dirPath);
      if (!allowed) {
        throw new Error(`Access denied: Path '${dirPath}' is outside the allowed directories configured via BIFROST_ALLOWED_DIRS.`);
      }

      let realDirPath: string;
      try {
        realDirPath = await fs.realpath(dirPath);
      } catch {
        realDirPath = path.resolve(dirPath);
      }

      if (isSensitivePath(dirPath) || isSensitivePath(realDirPath)) {
        throw new Error(`Access denied: Path contains sensitive file or folder.`);
      }

      const files = await fs.readdir(realDirPath);
      // Filter out files/folders that match sensitive patterns
      const allowedFiles = files.filter(file => {
        const fullFilePath = path.join(realDirPath, file);
        return !isSensitivePath(fullFilePath);
      });

      return { content: [{ type: "text", text: allowedFiles.join("\n") }] };
    }
    if (name === "read_file") {
      const filePath = args?.path;
      if (typeof filePath !== "string") {
        throw new Error("Path must be a string");
      }

      const allowed = await isPathAllowed(filePath);
      if (!allowed) {
        throw new Error(`Access denied: Path '${filePath}' is outside the allowed directories configured via BIFROST_ALLOWED_DIRS.`);
      }

      let realFilePath: string;
      try {
        realFilePath = await fs.realpath(filePath);
      } catch {
        realFilePath = path.resolve(filePath);
      }

      if (isSensitivePath(filePath) || isSensitivePath(realFilePath)) {
        throw new Error(`Access denied: Path contains sensitive file or folder.`);
      }

      const stat = await fs.stat(realFilePath);
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error(`Access denied: File size (${(stat.size / 1024).toFixed(1)} KB) exceeds the limit of 1 MB.`);
      }

      const binary = await isBinaryFile(realFilePath);
      if (binary) {
        throw new Error("Access denied: Binary files are not allowed.");
      }

      return { content: [{ type: "text", text: await fs.readFile(realFilePath, "utf-8") }] };
    }
    
    if (name === "save_plan" || name === "get_plan") {
      const planName = args?.name;
      if (typeof planName !== "string") {
        throw new Error("Plan name must be a string");
      }
      const safeName = planName.replace(/[^a-zA-Z0-9_-]/g, "");
      const p = path.join(PLANS_DIR, `${safeName}.md`);

      if (name === "save_plan") {
        const content = args?.content;
        if (typeof content !== "string") {
          throw new Error("Plan content must be a string");
        }
        await fs.mkdir(PLANS_DIR, { recursive: true });
        await fs.writeFile(p, content);
        return { content: [{ type: "text", text: `Saved: ${p}` }] };
      }
      if (name === "get_plan") {
        return { content: [{ type: "text", text: await fs.readFile(p, "utf-8") }] };
      }
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: e.message }], isError: true };
  }
  throw new Error(`Invalid tool: ${name}`);
});

server.connect(new StdioServerTransport()).catch(console.error);
