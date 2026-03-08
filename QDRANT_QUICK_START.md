# Qdrant Quick Start

✅ **Status**: Qdrant is running locally on port 6333

## What's Set Up

```
my-pi-extension/
├── docker-compose.yml           # Qdrant service definition
├── .env.docker                  # Configuration & API key
├── VECTOR_DB_SETUP.md          # Full documentation
├── scripts/test-qdrant.sh      # Test suite (all passing ✅)
└── qdrant_data/                # Persistent volume
```

## Quick Commands

### View Status
```bash
docker-compose ps
```

### Check Logs
```bash
docker-compose logs qdrant
```

### Run Tests
```bash
./scripts/test-qdrant.sh
```

### Restart Qdrant
```bash
docker-compose restart qdrant
```

### Stop Qdrant
```bash
docker-compose down
```

## Connection Details

- **URL**: `http://localhost:6333`
- **API Key**: `qdrant-secure-key-2024`
- **Vector Size**: 384 (nomic-embed-text)
- **Distance**: Cosine similarity
- **Web UI**: http://localhost:6333/dashboard (Coming soon)

## Test Results

All tests passed ✅:

1. ✅ Connection verified
2. ✅ Collection creation working
3. ✅ Document insertion working  
4. ✅ Vector search working
5. ✅ Container health ok

## API Examples

### Search Documents
```bash
curl -X POST http://localhost:6333/collections/documents/points/search \
  -H "api-key: qdrant-secure-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, ...],
    "limit": 5,
    "with_payload": true
  }'
```

### List Collections
```bash
curl http://localhost:6333/collections \
  -H "api-key: qdrant-secure-key-2024" | jq .
```

## Next: Vector DB Extension

Ready to create the pi extension with tools:
- `vector_search` - Semantic search
- `vector_index_document` - Add documents
- `vector_index_directory` - Batch index files

See VECTOR_DB_SETUP.md for full documentation.

## Resources

- 📚 [Qdrant Documentation](https://qdrant.tech/documentation/)
- 🐳 [Docker Hub](https://hub.docker.com/r/qdrant/qdrant)
- 🧮 [Nomic Embed Text](https://www.nomic.ai/blog/nomic-embed-text-v1)
