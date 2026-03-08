# Project Dependencies

## Qdrant Vector Database Setup

### Required
- **Docker Desktop** - For running Qdrant container
- **curl** - For API calls (included on macOS/Linux)
- **jq** - For JSON processing (included on most systems)

### Optional (Only if using local embeddings)
- **Ollama** - For local embedding models (runs in Docker, optional)

### NOT Required
- ❌ **Python** - Qdrant is fully self-contained in Docker
- ❌ Any Python libraries - All embedding generation is either:
  - Via API calls (to LLM providers)
  - Via Ollama HTTP API (in Docker)
  - Via Node.js libraries in the pi extension

## Why No Python?

The architecture avoids Python entirely:

```
User Request
    ↓
Pi Extension (TypeScript)
    ↓
    ├─→ Call LLM API for embeddings (HTTP)
    │   (Anthropic, OpenAI, etc. - no local processing)
    │
    └─→ OR call Ollama (Docker) for embeddings
        (Local inference in container - no Python needed)
    ↓
Qdrant REST API (HTTP)
    ↓
Vector Search Results
```

## System Requirements

**Check you have these:**

```bash
# Docker (required)
docker --version
# Docker version 20.10+ or Docker Desktop

# curl (required)
curl --version

# jq (optional, used in test script)
jq --version
# If missing: brew install jq

# python (NOT required)
# You can skip this entirely
```

## Installation Checklist

- [x] Docker Desktop installed
- [x] curl available
- [x] jq available (or: `brew install jq`)
- [ ] Python 3.11+ (optional, not needed for this project)

## Running the Setup

No additional dependencies to install:

```bash
cd /Users/boyw165/Projects/my-pi-extension

# 1. Start Qdrant (using Docker)
docker-compose up -d

# 2. Test connection (uses bash/curl/jq)
./scripts/test-qdrant.sh

# Done! No pip install, no virtual env, no Python setup needed.
```

## For the Pi Extension

When we create the vector-db extension, it will use:

- **TypeScript/Node.js** - Extension language (pi requirement)
- **Node.js HTTP client** - For API calls
- **Optional: Ollama HTTP API** - For local embeddings (if enabled)

All dependencies managed by npm, no Python involved.

## Summary

| Component | Language | Packaging |
|-----------|----------|-----------|
| **Qdrant** | Rust | Docker image |
| **Ollama** (optional) | Python (internal) | Docker image |
| **Pi Extension** | TypeScript | npm packages |
| **Your setup** | Bash/Curl | (This project) |

**Python 3.11 is completely optional** - not needed for Qdrant or pi extension development.
