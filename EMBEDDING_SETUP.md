# Quick Embedding Setup Guide

## Choose Your Strategy

### Strategy A: Ollama Only (Recommended for Dev)

**Cost**: FREE  
**Quality**: Good  
**Speed**: Fast (with GPU)  
**Privacy**: Complete  

```bash
# 1. Enable in docker-compose.yml (uncomment ollama section)
# Edit docker-compose.yml and uncomment the ollama service

# 2. Start Ollama
docker-compose up -d ollama

# 3. Pull embedding model
docker exec ollama ollama pull nomic-embed-text

# 4. Verify
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "test"}' | jq '.embedding | length'
# Should output: 384

# 5. Run crawler (will automatically use Ollama)
node scripts/crawl-forma-help-center.js --full
```

**Output**: ✅ Using Ollama for all embeddings

---

### Strategy B: Ollama + OpenAI Fallback (Recommended for Prod)

**Cost**: ~$0.002 per 300 chunks  
**Quality**: Good + Excellent fallback  
**Speed**: Fast  
**Reliability**: Very high  

```bash
# 1. Set up Ollama (same as Strategy A)
docker-compose up -d ollama
docker exec ollama ollama pull nomic-embed-text

# 2. Get OpenAI API key
# Visit: https://platform.openai.com/api-keys
# Create new key

# 3. Set API key in .env.docker
# Edit .env.docker and add:
# OPENAI_API_KEY=sk-proj-...

# OR set environment variable
export OPENAI_API_KEY=sk-proj-...

# 4. Run crawler (will use Ollama, fallback to OpenAI if needed)
node scripts/crawl-forma-help-center.js --full
```

**Output**:
```
⚙️  Embedding Configuration:
   Primary:  Ollama (nomic-embed-text) @ http://localhost:11434
   Fallback: OpenAI (text-embedding-3-small)
```

---

### Strategy C: OpenAI Only (Recommended for Cloud)

**Cost**: ~$0.002 per 300 chunks  
**Quality**: Excellent  
**Speed**: Fast  
**Setup**: Simple  

```bash
# 1. Get OpenAI API key
# Visit: https://platform.openai.com/api-keys

# 2. Set API key
export OPENAI_API_KEY=sk-proj-...

# 3. Run crawler (will use OpenAI since Ollama not available)
node scripts/crawl-forma-help-center.js --full
```

**Output**:
```
⚙️  Embedding Configuration:
   Primary:  Ollama (nomic-embed-text) @ http://localhost:11434
   Fallback: OpenAI (text-embedding-3-small)

   [Ollama fails to connect]

   Using OpenAI for embeddings...
```

---

## Verification

### Check Ollama Setup

```bash
# Is Ollama running?
docker-compose ps | grep ollama

# Is model downloaded?
docker exec ollama ollama list

# Test Ollama directly
curl -X POST http://localhost:11434/api/embeddings \
  -d '{
    "model": "nomic-embed-text",
    "prompt": "test text here"
  }' | jq '.'

# Expected: JSON with "embedding" array of 384 floats
```

### Check OpenAI Setup

```bash
# Is API key set?
echo $OPENAI_API_KEY

# Should print: sk-proj-... (not empty)

# Verify key is valid
node -e "
const { OpenAI } = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
client.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'test'
}).then(r => console.log('✅ Valid key')).catch(e => console.error('❌', e.message));
"
```

---

## Embedding Method Usage

### How Crawler Chooses

```
For each chunk:
  1. Try Ollama
     ├─ If available → Use (free) ✅
     └─ If unavailable → Continue
  
  2. Try OpenAI
     ├─ If API key set → Use ($$) ✅
     └─ If no key → Continue
  
  3. Use hash-based fallback
     └─ If everything fails (poor quality ⚠️)
```

### Force a Specific Method

```bash
# Use Ollama only (will fail if unavailable)
# Modify crawler: Remove OpenAI fallback code

# Use OpenAI only (disable Ollama)
# Stop Ollama: docker-compose stop ollama
# Crawler will skip to OpenAI

# Use hash-based only (for testing)
# Stop Ollama and don't set OPENAI_API_KEY
```

---

## Cost Estimation

### Ollama Only
```
300 articles × ~375 tokens = 112,500 tokens total
Cost: Electricity (~$0.003) ✅ CHEAPEST

Time: 5-30 minutes (with GPU)
      60-150 minutes (on CPU)
```

### OpenAI Only
```
Cost: 112,500 tokens ÷ 1,000,000 × $0.02 = $0.0023 ✅ AFFORDABLE

Time: 3-10 minutes (with parallelization)
```

### Hybrid (Ollama + OpenAI fallback)
```
Cost: ~$0.0003 (only if Ollama fails) ✅ BEST

Expected: ~$0 (Ollama handles 99% of chunks)
Worst case: ~$0.002 (if Ollama down)

Time: 5-30 minutes (Ollama primary, fast)
      Falls back to 3-10 minutes (OpenAI)
```

---

## Troubleshooting

### I'm getting poor search results

```bash
# Check which embedding method is being used
node scripts/crawl-forma-help-center.js --full 2>&1 | grep -E "(Using|Embedding|⚠️)"

# If you see "hash-based fallback":
# → Set up Ollama or OpenAI API key

# If Ollama or OpenAI working but results still poor:
# → Increase chunk context window
# → Use better chunking strategy
```

### Ollama is slow

```bash
# Check if GPU is being used
docker exec ollama ollama show nomic-embed-text

# On Mac with Apple Silicon:
# → Should see "GPU acceleration available"

# On Linux with NVIDIA:
# → Install nvidia-docker and add to docker-compose

# On CPU-only:
# → Use OpenAI instead (faster cloud API)
```

### OpenAI API errors

```bash
# Check API key
echo $OPENAI_API_KEY
# Should output: sk-proj-... (not empty)

# Verify in code
node -e "
const key = process.env.OPENAI_API_KEY;
if (!key) console.error('❌ No API key');
else if (key.startsWith('sk-')) console.log('✅ Valid format');
else console.error('❌ Invalid format');
"

# Check rate limits
# → Wait 1-2 minutes between large crawls
# → Use OpenAI batch API for production
```

### Out of memory

```bash
# Increase Docker memory limits
# Edit docker-compose.yml:
# services:
#   ollama:
#     deploy:
#       resources:
#         limits:
#           memory: 8G  # Adjust as needed
```

---

## Configuration Reference

### Environment Variables

```bash
# Required
VECTOR_DB_URL=http://localhost:6333
QDRANT_API_KEY=qdrant-secure-key-2024

# Optional (Ollama, if using local)
OLLAMA_URL=http://localhost:11434

# Optional (OpenAI, if using as fallback)
OPENAI_API_KEY=sk-proj-...
```

### .env.docker Template

```bash
# Copy to .env.docker and update

# Qdrant
QDRANT_API_KEY=qdrant-secure-key-2024
VECTOR_DB_URL=http://localhost:6333
VECTOR_DB_VECTOR_SIZE=384

# Ollama (local)
OLLAMA_URL=http://localhost:11434

# OpenAI (fallback)
# OPENAI_API_KEY=sk-proj-...
```

---

## Recommended Setup

### For Development
```bash
# Ollama only
docker-compose up -d ollama
docker exec ollama ollama pull nomic-embed-text

# Cost: FREE
# Speed: Fast (GPU) or slow (CPU)
# Privacy: Complete
```

### For Production
```bash
# Ollama + OpenAI
docker-compose up -d ollama
docker exec ollama ollama pull nomic-embed-text

export OPENAI_API_KEY=sk-proj-...

# Cost: ~$0.0003 average (fallback only)
# Speed: Fast
# Reliability: 99.99%
```

### For Cloud (No GPU)
```bash
# OpenAI only
export OPENAI_API_KEY=sk-proj-...

# Cost: ~$0.002 per 300 chunks
# Speed: Fast
# Reliability: 99.99%
```

---

## Next Steps

1. Choose your strategy (A, B, or C above)
2. Set up embeddings
3. Run: `node scripts/test-crawler.js` to verify
4. Run: `node scripts/crawl-forma-help-center.js --full` to crawl

## Support

For more details, see:
- `EMBEDDING_STRATEGY.md` - Deep dive into strategies
- `CRAWLING_GUIDE.md` - Full crawling guide
- `VECTOR_DB_SETUP.md` - Vector database setup
