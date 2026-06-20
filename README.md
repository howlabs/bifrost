# Bifrost MCP

Local bridge connecting ChatGPT Web to local Claude/Codex CLIs.
ChatGPT writes the plan to `~/.chatgpt_plans`. Claude reads it and codes.

**Luồng hoạt động:**  
ChatGPT → tunnel → Bifrost → ~/.chatgpt_plans → Claude đọc & code

<img width="1376" height="768" alt="bifrost" src="https://github.com/user-attachments/assets/1756bd02-feb6-4769-97cf-d4d5095271eb" />

## Tools
- `save_plan(name, content)`: Writes `.md` plan. Enforces Overview, Stack, Structure, Steps.
- `get_plan(name)`: Reads `.md` plan.
- `list_dir(path)`: Lists files in a local directory (useful for ChatGPT to explore codebase).
- `read_file(path)`: Reads local file contents (useful for ChatGPT to audit code).

## Setup
```bash
npm install
npm run build
```

## Security & Environment Configuration

Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

Define your environment variables inside `.env`:
- `OPENAI_API_KEY`: Your OpenAI API key for `tunnel-client`. **WARNING:** Never commit the `.env` file containing secrets to version control.
- `BIFROST_ALLOWED_DIRS`: Allowed workspace directories for `list_dir` and `read_file` (separated by `;` on Windows, `:` on Unix, or `,` on any platform). If left empty, all filesystem reads will be blocked.

## Connect ChatGPT (via Tunnel)

Requires OpenAI `tunnel-client`:
```bash
# Environment variables will be loaded from your .env file
tunnel-client run --control-plane.tunnel-id <YOUR_TUNNEL_ID> --mcp.command "command=npx,args=tsx,args=index.ts"
```

## Connect Claude (Local)

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bifrost": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/bifrost/index.ts"]
    }
  }
}
```
