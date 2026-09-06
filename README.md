# jstage-mcp-server

An MCP server for searching Japanese scientific articles and publications on **J-STAGE** (the JST platform — Japan Science and Technology Agency).

- Unlike NCBI, J-STAGE does not require an API key
- It has only ۳ types of services (journal search, issue list, article search), not ۱۱
- It returns **metadata only**, not full text — for full text, you need to go to the publisher's site using the `link`/`doi` field of each result

---

## Step ۰: Prerequisites

- Node.js version ۱۸ or higher (because of global `fetch`)
- npm

## Step ۱: Installation

```bash
git clone <download or copy this folder>
cd jstage-mcp-server
npm install
```

## Step ۲: Compilation

```bash
npm run build
```

This creates the `build/` folder with the compiled JavaScript files.

## Step ۳: Local testing with MCP Inspector

Before connecting it to Claude, it's better to make sure the server works correctly with the official MCP testing tool:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

This opens a local web interface where you can directly call the `jstage_search_articles`, `jstage_search_journals`, `jstage_list_volumes` tools and see the actual J-STAGE response — without Claude being involved at all.

Sample input for testing `jstage_search_articles`:
```json
{ "keyword": "人工知能", "count": 5 }
```
(“人工知能” means “artificial intelligence” — since most J-STAGE content is Japanese, searching in Japanese usually gives better results)

## Step ۴: Connecting to Claude Desktop (stdio mode — local)

Open the Claude Desktop configuration file (usually `claude_desktop_config.json`) and add this:

```json
{
  "mcpServers": {
    "jstage": {
      "command": "node",
      "args": ["/full/path/to/jstage-mcp-server/build/index.js"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

After saving, restart Claude Desktop. Now you can say: “Find an article about such-and-such topic on J-STAGE”.

## Step ۵: Connecting to Claude Code

```bash
claude mcp add --transport stdio jstage node /full/path/to/jstage-mcp-server/build/index.js
```

Then you can check that the server is connected with `/mcp`.

## Step ۶: Deploying for remote access (Claude.ai web)

To allow Claude.ai (the web version) to connect to it as well, you need to run the HTTP server at a public address.

### Local HTTP testing
```bash
MCP_TRANSPORT_TYPE=http npm run start:http
# the server listens on http://localhost:3011/mcp
```

### Actual deployment
Since this server uses Express (rather than just an API route like the Next.js example), the simplest options are:
- **Docker** on any VPS (for example, a simple `Dockerfile` with `CMD ["node", "build/index.js"]` and `ENV MCP_TRANSPORT_TYPE=http`)
- **Railway / Render / Fly.io** — these directly deploy ordinary Node.js apps from a repository

After deployment, in **Claude.ai → Settings → Connectors → Add custom connector**, provide the address `https://your-domain.com/mcp`.

---