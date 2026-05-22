# Quickstart

## 1. Environment Setup

```bash
cp infra/.env.example infra/.env
# Edit infra/.env with your API keys
```

## 2. Start Infrastructure

Start the minimal profile (OmniRoute + Qdrant + Redis):
```bash
docker compose -f infra/docker-compose.yml --profile minimal up -d
```

To start the full stack:
```bash
docker compose -f infra/docker-compose.yml --profile full up -d
```

## 3. Verify Health

Using the CLI:
```bash
npx orch status
```

## 4. Use via MCP

In Claude Code, add the MCP server:
```bash
claude mcp add orch npx --yes @undrestrator/mcp-server
```
