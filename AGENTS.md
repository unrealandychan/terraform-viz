# rekipedia — AI Codebase Intelligence

This repository uses [rekipedia](https://github.com/unrealandychan/rekipedia) to maintain a structured wiki and answer questions about the codebase.

## Available commands

| Command                 | What it does                                                                |
| ----------------------- | --------------------------------------------------------------------------- | --- | ----- |
| `reki scan .`           | Full scan — extract symbols, generate wiki pages, build knowledge store     |
| `reki update .`         | Incremental refresh — only re-processes changed files                       |
| `reki ask "<question>"` | Ask anything about the codebase — grounded answers with file:line citations |
| `reki serve .`          | Start local web UI at http://127.0.0.1:7070 to browse wiki & ask questions  |
| `reki embed .`          | Build / rebuild the semantic search index (FAISS) for hybrid RAG            |
| `reki export .`         | Export wiki to a single file (--format md                                   | zip | json) |

## When to use rekipedia

- Before answering questions about the codebase architecture, run `reki ask "<your question>"` to get grounded context
- After making significant changes, run `reki update .` to keep the wiki current
- When asked to understand how a feature works, check the wiki first with `reki ask`
- When onboarding to an unfamiliar part of the codebase, use `reki ask` for guided explanation

## Setup (first time)

```bash
reki scan .          # generates the wiki and knowledge store
reki embed .         # builds semantic search index (optional, for RAG)
```

The knowledge store lives in `.rekipedia/store.db` — portable, local, no cloud required.

---

## rekipedia Codebase Knowledge Base

This repository has been scanned by [rekipedia](https://github.com/unrealandychan/rekipedia).
A structured wiki, symbol index, and RAG embeddings are in `.rekipedia/`.

### Ask questions about this codebase

```bash
reki ask "<your question>"
# Examples:
reki ask "how does authentication work?"
reki ask "what is the entry point of the application?"
reki ask "which modules are most critical?"
```

### MCP server (for Claude Code, Cursor, and other MCP-aware agents)

```bash
reki mcp
```

Available MCP tools: `ask`, `search_nodes`, `get_context`, `get_relationships`, `get_hub_nodes`, `get_impact`

> Tip: `.mcp.json` in the repo root auto-configures the MCP server for Claude Code.
