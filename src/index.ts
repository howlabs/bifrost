#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createServer();

server.connect(new StdioServerTransport()).catch(console.error);
