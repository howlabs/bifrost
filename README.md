# Bifrost MCP

Local bridge connecting ChatGPT Web to local Claude/Codex CLIs.
ChatGPT writes the plan to `~/.chatgpt_plans`. Claude reads it and codes.

## Tools
- `save_plan(name, content)`: Writes `.md` plan. Enforces Overview, Stack, Structure, Steps.
- `get_plan(name)`: Reads `.md` plan.

## Setup
```bash
npm install
npm run build
```

## Connect ChatGPT (via Tunnel)
Requires OpenAI `tunnel-client` and an API key:
```bash
export OPENAI_API_KEY="sk-proj-..."
tunnel-client run --control-plane.tunnel-id <YOUR_TUNNEL_ID> --mcp.command "command=node,args=build/index.js"
```

## Connect Claude (Local)
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bifrost": {
      "command": "node",
      "args": ["/absolute/path/to/bifrost/build/index.js"]
    }
  }
}
```
