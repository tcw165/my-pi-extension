# Forma Help Center → Qdrant Crawling Guide

## Overview

This guide explains how to crawl the Forma Help Center website and ingest articles into your local Qdrant vector database for semantic search.

## Architecture

```
Forma Help Center (HTML)
       ↓
   Crawler Script
   ├─ Discover articles
   ├─ Fetch & parse HTML
   ├─ Extract content
       ↓
   Smart Chunking
   ├─ Split by sections
   ├─ Maintain context
   ├─ Keep under token limit
       ↓
   Embedding Generation
   ├─ Use Ollama (local) OR
   ├─ Use API (Anthropic/OpenAI)
       ↓
    Qdrant Storage
    └─ Batch upsert points
       ↓
    Search via Pi Tools
    └─ vector_search, vector_crawl_url
```

## Components

### 1. Main Crawler Script

**File**: `scripts/crawl-forma-help-center.js`

Features:
- ✅ Discovers all articles from help center
- ✅ Fetches and parses HTML with cheerio
- ✅ Extracts title, breadcrumb, content
- ✅ Smart chunking by sections
- ✅ Generates embeddings (Ollama or fallback)
- ✅ Batch inserts into Qdrant
- ✅ Retry logic for failed requests
- ✅ Progress tracking

### 2. Test Crawler Script

**File**: `scripts/test-crawler.js`

Demonstrates the full pipeline with mock data:
- Shows chunking, embedding, storage
- Tests vector search
- No network requests to external sites
- Perfect for testing without hitting Forma's site

### 3. Test Suite

**File**: `scripts/test-qdrant.sh`

Verifies Qdrant is working correctly.

## Usage

### Test the Pipeline (Recommended Start)

Test with mock Forma Help Center articles:

```bash
cd /Users/boyw165/Projects/my-pi-extension
node scripts/test-crawler.js
```

Output:
```
✅ Connected to Qdrant
✅ Collection created
✅ 3 articles processed into 3 chunks
✅ Stored 3 points in Qdrant

📚 Test Searches:
  Query: "FSA eligible expenses"
    1. What expenses are eligible for my FSA? (7%)
  Query: "HSA contribution limits"
    1. Understanding HSA contribution limits (13%)
```

### Crawl Live Help Center

To crawl the actual Forma Help Center:

```bash
# Full crawl of all articles
node scripts/crawl-forma-help-center.js --full

# Single article
node scripts/crawl-forma-help-center.js --url "https://support.joinforma.com/hc/en-us/articles/..."

# Help
node scripts/crawl-forma-help-center.js --help
```

**Note**: The Forma Help Center has anti-bot protection (HTTP 403). You can:
1. Use the test crawler with mock data
2. Modify the crawler to use browser automation (slower)
3. Request robots.txt permission

## How It Works

### Discovery Phase

```javascript
// Crawls the help center homepage
// Finds all category and article links
// Returns array of article URLs

Discovered:
  - Help Center > Claims > What's eligible?
  - Help Center > HSA > Limits
  - Help Center > Claims > How to submit
  ... (200+ more)
```

### Parsing Phase

```javascript
// Fetches each article HTML
// Extracts using cheerio (CSS selectors)
// Preserves structure:
//   - Title
//   - Breadcrumb (category path)
//   - Body content
//   - Section headings

Extracted:
{
  title: "What expenses are eligible for my FSA?",
  breadcrumb: "Help Center > Claims > Eligibility",
  content: "Dental care is eligible... Medical services...",
  url: "https://support.joinforma.com/..."
}
```

### Chunking Phase

Articles are split into manageable chunks:

```javascript
// Article too long (5000 chars)
Article: "What expenses are eligible for my FSA?"
  ├─ Chunk 0: Title + Intro + Dental
  ├─ Chunk 1: Medical Services + Supplies  
  ├─ Chunk 2: Pharmacy + Vision
  └─ Chunk 3: Items Requiring LMN

Each chunk:
- ~1000-1500 chars (optimal for embeddings)
- Includes title & breadcrumb (context)
- Single semantic topic
- Can be searched independently
```

### Embedding Phase

```javascript
// Generate vector embedding for each chunk
// Options:

// Option 1: Local Ollama (fast, no API cost)
POST http://localhost:11434/api/embeddings
body: { model: "nomic-embed-text", prompt: text }
response: { embedding: [0.1, 0.2, ...] }

// Option 2: API Provider (cloud-based)
POST https://api.anthropic.com/v1/embeddings
body: { input: text, model: "..." }
response: { embedding: [...] }

// Result: 384-dimensional vector for each chunk
```

### Storage Phase

```javascript
// Batch upsert points into Qdrant
PUT /collections/forma_help_center/points
{
  "points": [
    {
      "id": 12345,
      "vector": [0.1, 0.2, ..., 0.384],  // 384 dims
      "payload": {
        "title": "What expenses are eligible for my FSA?",
        "url": "https://support.joinforma.com/...",
        "breadcrumb": "Help Center > Claims",
        "content": "Dental care, medical services...",
        "chunkIndex": 0,
        "chunkSize": 4,
        "timestamp": 1709856000
      }
    },
    ...
  ]
}
```

### Search Phase

```javascript
// User searches via pi tools
User: "What FSA items need a letter of medical necessity?"

// Generate query embedding (same model)
query_vector = embed("What FSA items need a letter...")

// Search Qdrant
POST /collections/forma_help_center/points/search
{
  "vector": query_vector,
  "limit": 5,
  "with_payload": true
}

// Results (with relevance scores)
1. Items Requiring LMN (92% match)
2. What expenses are eligible (78% match)
3. Medical Supplies (65% match)
```

## Configuration

### Environment Variables

Set in `.env.docker` or environment:

```bash
# Qdrant
VECTOR_DB_URL=http://localhost:6333
QDRANT_API_KEY=qdrant-secure-key-2024

# Vector embeddings
VECTOR_DB_VECTOR_SIZE=384           # nomic-embed-text output
VECTOR_DB_EMBEDDING_MODEL=nomic-embed-text

# Ollama (local embeddings)
OLLAMA_HOST=http://localhost:11434  # optional
```

### Script Configuration

Edit the script constants:

```javascript
const HELP_CENTER_BASE = 'https://support.joinforma.com/hc/en-us';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'forma_help_center';
const DELAY_MS = 500;           // Delay between requests
const MAX_CHUNK_SIZE = 1500;    // Max chars per chunk
```

## Performance

### Time Estimates

| Phase | Time | Notes |
|-------|------|-------|
| Discovery | ~2 min | Scan all categories |
| Fetch | ~20 min | 200 articles @ 0.5s delay |
| Parse | ~2 min | Extract content |
| Embed | ~30 min | Depends on embedding service |
| Store | ~1 min | Batch upsert |
| **Total** | ~55 min | One-time crawl |

**Subsequent crawls**: Incremental updates can be much faster (5-10 min)

### Storage Size

- 200+ articles
- 400-500 chunks  
- ~10-20 MB in Qdrant storage
- 384-dimensional vectors

## Chunking Strategy

### Why Chunk?

- Full articles are too long for embedding (5000+ chars)
- Individual embeddings must be semantic units
- Chunks must fit in context windows

### How Chunks Are Created

```javascript
// Split by markdown headings (## and ###)
// Maintain article title & breadcrumb in each chunk
// Keep chunks under 1500 characters
// Merge small sections with previous chunk

Article (4000 chars)
├─ Title + Intro
├─ ## Section 1 (800 chars) → Chunk 0
├─ ## Section 2 (900 chars) → Chunk 1
├─ ## Section 3 (700 chars) → Chunk 2
└─ ## Section 4 (600 chars) → Chunk 3
```

### Chunk Metadata

Each chunk stores:

```json
{
  "title": "What expenses are eligible for my FSA?",
  "url": "https://support.joinforma.com/...",
  "breadcrumb": "Help Center > Claims > Eligibility",
  "content": "Full chunk text (first 2000 chars)",
  "chunkIndex": 1,        // Part 2 of 4
  "chunkSize": 4,         // Total chunks
  "timestamp": 1709856000,
  "contentLength": 987    // Full content length
}
```

## Embedding Options

### Option 1: Local Ollama (Recommended)

**Pros**: 
- Free, no API keys
- No rate limits
- Privacy (data stays local)
- Fast (if GPU available)

**Setup**:

```bash
# Start Ollama (already in docker-compose if uncommented)
docker-compose up -d ollama
sleep 10

# Pull embedding model
docker exec ollama ollama pull nomic-embed-text

# Test
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

**Model options**:
- `nomic-embed-text` (384 dims) - Default, good quality
- `all-minilm` (384 dims) - Smaller, faster
- `mistral-embedding` (4096 dims) - Higher quality, slower

### Option 2: API Provider

Use Anthropic, OpenAI, or other providers:

```javascript
// Example: Anthropic Claude API
async function getEmbedding(text) {
  const response = await fetch('https://api.anthropic.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-small',
      input: text
    })
  });
  return response.json().embedding;
}
```

**Pros**: High quality embeddings
**Cons**: API costs, rate limits, latency

## Quality Metrics

After crawling, check quality:

```bash
# Connection
curl http://localhost:6333/collections/forma_help_center \
  -H "api-key: qdrant-secure-key-2024" | jq .result

# Should show:
{
  "points_count": 400,
  "config": {
    "params": {
      "vectors": {
        "size": 384,
        "distance": "Cosine"
      }
    }
  }
}
```

## Searching

### Via Command Line

```bash
# Generate embedding for query
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "FSA eligible"}'

# Search Qdrant
curl -X POST http://localhost:6333/collections/forma_help_center/points/search \
  -H "api-key: qdrant-secure-key-2024" \
  -d '{
    "vector": [0.1, 0.2, ...],
    "limit": 5,
    "with_payload": true
  }' | jq .result
```

### Via Pi Tools

Once indexed, use the pi extension:

```
User: "What's the best way to use my HSA?"

Pi will:
  1. Generate embedding for query
  2. Call vector_search tool
  3. Find matching articles
  4. Return top 5 with URLs
```

## Troubleshooting

### Issue: Crawl is very slow

**Cause**: Waiting for embeddings or network
**Solution**: 
- Use Ollama with GPU
- Reduce chunk size
- Use batch processing

### Issue: Low search quality

**Cause**: Poor embeddings or bad chunking
**Solution**:
- Use better embedding model (higher dims)
- Adjust chunk boundaries
- Add more context to chunks

### Issue: Out of memory

**Cause**: Processing huge articles
**Solution**:
- Reduce MAX_CHUNK_SIZE
- Process in smaller batches
- Increase container memory limits

### Issue: Rate limited by website

**Cause**: Crawler hitting server too fast
**Solution**:
- Increase DELAY_MS
- Use test-crawler.js instead

## Integration with Pi Extension

After crawling, create pi tools to search:

### vector_search (Already Available)

```
Tool: vector_search
Input: query (text to search)
Output: top 5 matching chunks with URLs
```

### vector_crawl_url (To Implement)

```
Tool: vector_crawl_url  
Input: url (article to index)
Output: chunks stored in Qdrant
```

### vector_db_stats (To Implement)

```
Tool: vector_db_stats
Output: Collection stats, point count, etc.
```

## Next Steps

1. ✅ **Test Pipeline** - `node scripts/test-crawler.js`
2. ⏳ **Configure Ollama** - Uncomment in docker-compose.yml
3. ⏳ **Crawl Live** - `node scripts/crawl-forma-help-center.js --full`
4. ⏳ **Create Pi Tools** - Extend vector-db extension
5. ⏳ **Add Skills** - Document search patterns

## Advanced: Incremental Updates

For periodic re-crawling:

```bash
# Keep track of article hashes
# Only re-fetch if hash changed
# Only re-embed if content changed
# Use upsert (PUT) to update existing points

# Result: Much faster incremental updates
```

## Resources

- 📚 [Qdrant Docs](https://qdrant.tech/documentation/)
- 🧠 [Nomic Embed Text](https://www.nomic.ai/blog/nomic-embed-text-v1)
- 🐳 [Ollama Models](https://ollama.ai)
- 📖 [Cheerio Parser](https://cheerio.js.org/)

---

**Happy Crawling!** 🚀

The pipeline is ready to index knowledge bases and power semantic search in your pi extension.
