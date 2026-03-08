# Vector Database Setup (Qdrant + Docker)

Local semantic search and RAG capabilities powered by Qdrant vector database.

## Overview

- **Qdrant**: Vector database for semantic search
- **Embeddings**: Using nomic-embed-text (384-dimensional)
- **Port**: 6333 (REST API), 6334 (gRPC)
- **Storage**: Local Docker volume (`qdrant_data/`)

## Quick Start

### 1. Start Qdrant

```bash
cd /Users/boyw165/Projects/my-pi-extension
docker-compose up -d
```

### 2. Verify Connection

```bash
curl -s http://localhost:6333/collections \
  -H "api-key: qdrant-secure-key-2024" | jq .
```

Expected response:
```json
{
  "result": {
    "collections": []
  },
  "status": "ok"
}
```

### 3. Check Container Status

```bash
docker ps | grep qdrant
docker logs qdrant
```

## API Examples

### Create a Collection

```bash
curl -X PUT http://localhost:6333/collections/documents \
  -H "api-key: qdrant-secure-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

### Insert Documents

```bash
curl -X PUT http://localhost:6333/collections/documents/points \
  -H "api-key: qdrant-secure-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": 1,
        "vector": [0.1, 0.2, 0.3, ...384 floats...],
        "payload": {
          "text": "Sample document",
          "source": "example"
        }
      }
    ]
  }'
```

### Search

```bash
curl -X POST http://localhost:6333/collections/documents/points/search \
  -H "api-key: qdrant-secure-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, ...384 floats...],
    "limit": 5,
    "with_payload": true
  }'
```

## Configuration

### Environment Variables

Set in `.env.docker`:

```
QDRANT_API_KEY=qdrant-secure-key-2024
VECTOR_DB_URL=http://localhost:6333
VECTOR_DB_COLLECTION=documents
VECTOR_DB_VECTOR_SIZE=384
VECTOR_DB_EMBEDDING_MODEL=nomic-embed-text
```

### Docker Compose

- `docker-compose.yml` - Qdrant service definition
- Volumes: `qdrant_data/` - Persistent storage
- Networks: `vector-db` - Internal docker network

## Container Management

### View Logs

```bash
docker logs qdrant -f
```

### Stop Qdrant

```bash
docker-compose down
```

### Stop & Remove Data

```bash
docker-compose down -v
```

### Restart Qdrant

```bash
docker-compose restart qdrant
```

## Integration with Pi Extension

Tools available (when vector-db extension is loaded):

1. **vector_index_document** - Index a single document
2. **vector_search** - Semantic search across indexed documents
3. **vector_index_directory** - Batch index files from a directory

See `~/.pi/agent/extensions/vector-db.ts` for implementation.

## Optional: Local Embeddings with Ollama

To use local embeddings instead of API calls:

### 1. Uncomment Ollama in docker-compose.yml

```yaml
ollama:
  image: ollama/ollama:latest
  container_name: ollama
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
```

### 2. Start Ollama

```bash
docker-compose up -d ollama
```

### 3. Download Embedding Model

```bash
docker exec ollama ollama pull nomic-embed-text
```

### 4. Update Extension

Change embedding endpoint in extension from:
- `http://localhost:11434/api/embeddings` (local)
- to your API provider (Anthropic, OpenAI, etc.)

## Monitoring

### Qdrant Web UI

Qdrant includes a web UI available at:
```
http://localhost:6333/dashboard
```

### Check Collection Stats

```bash
curl -s http://localhost:6333/collections/documents \
  -H "api-key: qdrant-secure-key-2024" | jq .
```

### Delete Collection

```bash
curl -X DELETE http://localhost:6333/collections/documents \
  -H "api-key: qdrant-secure-key-2024"
```

## Performance Tips

1. **Batch Indexing** - Use `vector_index_directory` for bulk operations
2. **Limit Vector Size** - Keep documents under 5KB for efficiency
3. **Use Cosine Distance** - Standard for semantic search
4. **Regular Backups** - Docker volumes persist data, but backup important collections
5. **Index Selectively** - Not every file needs indexing

## Troubleshooting

### Connection Refused

```bash
# Check if Qdrant is running
docker ps | grep qdrant

# Check port binding
lsof -i :6333
```

### API Key Issues

Make sure to include header in all requests:
```bash
-H "api-key: qdrant-secure-key-2024"
```

### Out of Memory

Increase Docker memory allocation in Docker Desktop settings if indexing large datasets.

### Collection Not Found

Create collection first:
```bash
curl -X PUT http://localhost:6333/collections/documents \
  -H "api-key: qdrant-secure-key-2024" \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 384, "distance": "Cosine"}}'
```

## Resources

- **Qdrant Docs**: https://qdrant.tech/documentation/
- **Qdrant Python SDK**: https://github.com/qdrant/qdrant-client
- **Nomic Embed Text**: https://www.nomic.ai/blog/nomic-embed-text-v1
- **Docker Hub**: https://hub.docker.com/r/qdrant/qdrant

## Next Steps

1. ✅ Set up Qdrant container
2. ⏳ Create vector-db pi extension with tools
3. ⏳ Add skills documentation
4. ⏳ Integrate with pi workflows
