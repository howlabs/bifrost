import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getAllowedDirs } from "./utils.js";
import { getPlanHandler, listDirHandler, readFileHandler, savePlanHandler } from "./handlers.js";
import { BifrostError } from "./errors.js";
import os from "node:os";
import path from "node:path";

export function createServer() {
  const server = new Server(
    { name: "bifrost", version: "1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_plan",
        description: "Save a project plan. MUST include 4 sections: Overview, Tech Stack, Folder Structure, Steps.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            content: { type: "string" }
          },
          required: ["name", "content"],
        },
      },
      {
        name: "get_plan",
        description: "Get the project plan to write code.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: {
              anyOf: [{ type: "string" }, { type: "number" }],
              description: "Optional version of the plan to retrieve"
            }
          },
          required: ["name"]
        },
      },
      {
        name: "read_file",
        description: "Read ANY local file content (e.g., to audit code).",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the file" }
          },
          required: ["path"]
        },
      },
      {
        name: "list_dir",
        description: "List files in a directory to explore the workspace.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the directory" }
          },
          required: ["path"]
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const allowedDirs = getAllowedDirs();
    const plansDir = process.env.BIFROST_PLANS_DIR || path.join(os.homedir(), ".chatgpt_plans");

    try {
      if (name === "list_dir") {
        const result = await listDirHandler(args, allowedDirs);
        return { content: [{ type: "text", text: result }] };
      }
      if (name === "read_file") {
        const result = await readFileHandler(args, allowedDirs);
        return { content: [{ type: "text", text: result }] };
      }
      if (name === "save_plan") {
        const result = await savePlanHandler(args, plansDir);
        return {
          content: [
            {
              type: "text",
              text: `${result.message} Latest saved path: ${result.path}`
            }
          ]
        };
      }
      if (name === "get_plan") {
        const result = await getPlanHandler(args, plansDir);
        return { content: [{ type: "text", text: result }] };
      }
      throw new BifrostError("INVALID_ARGUMENT", `Invalid tool: ${name}`);
    } catch (e: any) {
      if (e instanceof BifrostError) {
        return {
          content: [{ type: "text", text: e.toStructuredString() }],
          isError: true
        };
      }
      // System error translation
      let code = "SYSTEM_ERROR";
      let message = e.message;
      if (e.code === "ENOENT") {
        code = "NOT_FOUND";
        message = "The requested file or directory does not exist.";
      } else if (e.code === "EACCES" || e.code === "EPERM") {
        code = "PERMISSION_DENIED";
        message = "Access denied by the operating system.";
      }
      return {
        content: [{ type: "text", text: `Error: [${code}] ${message}` }],
        isError: true
      };
    }
  });

  return server;
}
