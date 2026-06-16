#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const safeName = String(args?.name).replace(/[^a-zA-Z0-9_-]/g, "");
  const p = path.join(PLANS_DIR, `${safeName}.md`);

  try {
    if (name === "save_plan") {
      await fs.mkdir(PLANS_DIR, { recursive: true });
      await fs.writeFile(p, args?.content as string);
      return { content: [{ type: "text", text: `Saved: ${p}` }] };
    }
    if (name === "get_plan") {
      return { content: [{ type: "text", text: await fs.readFile(p, "utf-8") }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: e.message }], isError: true };
  }
  throw new Error(`Invalid tool: ${name}`);
});

server.connect(new StdioServerTransport()).catch(console.error);
