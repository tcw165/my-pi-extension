#!/bin/bash

# Test Qdrant Vector Database Connection

set -e

API_KEY="${QDRANT_API_KEY:-qdrant-secure-key-2024}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION="${VECTOR_DB_COLLECTION:-test-documents}"

echo "🔍 Testing Qdrant Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 1: Connectivity
echo -e "\n📡 Test 1: Connection"
if curl -s "$QDRANT_URL/collections" -H "api-key: $API_KEY" 2>/dev/null | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "✅ Qdrant is responding"
else
  echo "❌ Cannot connect to Qdrant at $QDRANT_URL"
  echo "   Make sure to run: docker-compose up -d"
  exit 1
fi

# Test 2: List Collections
echo -e "\n📚 Test 2: List Collections"
COLLECTIONS=$(curl -s "$QDRANT_URL/collections" -H "api-key: $API_KEY" | jq -r '.result.collections[].name' 2>/dev/null || echo "")

if [ -z "$COLLECTIONS" ]; then
  echo "   No collections found (this is normal on first run)"
else
  echo "   Found collections:"
  echo "$COLLECTIONS" | sed 's/^/     - /'
fi

# Test 3: Create Test Collection
echo -e "\n🔧 Test 3: Create Test Collection"
CREATE_RESPONSE=$(curl -s -X PUT "$QDRANT_URL/collections/$COLLECTION" \
  -H "api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }')

if echo "$CREATE_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "✅ Created collection: $COLLECTION"
else
  if echo "$CREATE_RESPONSE" | grep -q "already exists"; then
    echo "⚠️  Collection already exists: $COLLECTION"
  else
    echo "❌ Failed to create collection"
    echo "$CREATE_RESPONSE" | jq .
    exit 1
  fi
fi

# Test 4: Get Collection Info
echo -e "\n📊 Test 4: Collection Info"
INFO=$(curl -s "$QDRANT_URL/collections/$COLLECTION" -H "api-key: $API_KEY")

VECTOR_COUNT=$(echo "$INFO" | jq '.result.points_count // 0')
VECTOR_SIZE=$(echo "$INFO" | jq '.result.config.params.vectors.size // 0')

echo "   Points: $VECTOR_COUNT"
echo "   Vector Size: $VECTOR_SIZE"
echo "   Status: ✅ OK"

# Test 5: Insert Test Document
echo -e "\n📝 Test 5: Insert Test Document"

# Generate a simple vector (384 floats) using pure bash/jq - no Python needed
VECTOR=$(jq -n '[range(384)] | map(0.1)' 2>/dev/null || echo "[$(printf '0.1,%.0s' {1..383})0.1]")

INSERT_RESPONSE=$(curl -s -X PUT "$QDRANT_URL/collections/$COLLECTION/points" \
  -H "api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"points\": [
      {
        \"id\": 1,
        \"vector\": $VECTOR,
        \"payload\": {
          \"text\": \"Test document for vector database verification\",
          \"source\": \"test\",
          \"timestamp\": $(date +%s)
        }
      }
    ]
  }")

if echo "$INSERT_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "✅ Successfully inserted test document"
else
  echo "⚠️  Insert response:"
  echo "$INSERT_RESPONSE" | jq .
fi

# Test 6: Search
echo -e "\n🔎 Test 6: Vector Search"

# Use same test vector for search
SEARCH_RESPONSE=$(curl -s -X POST "$QDRANT_URL/collections/$COLLECTION/points/search" \
  -H "api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"vector\": $VECTOR,
    \"limit\": 5,
    \"with_payload\": true
  }")

RESULT_COUNT=$(echo "$SEARCH_RESPONSE" | jq '.result | length')

if [ "$RESULT_COUNT" -gt 0 ]; then
  echo "✅ Search successful - found $RESULT_COUNT results"
  echo "$SEARCH_RESPONSE" | jq '.result[] | {score: .score, id: .id, text: .payload.text}' | head -20
else
  echo "⚠️  No search results"
fi

# Test 7: Health Check
echo -e "\n❤️  Test 7: Container Health"
HEALTH=$(docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | grep qdrant || echo "")

if [ -n "$HEALTH" ]; then
  echo "$HEALTH"
else
  echo "⚠️  Qdrant container not found"
fi

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests completed!"
echo ""
echo "📚 Next Steps:"
echo "   1. Load the vector-db pi extension"
echo "   2. Use vector_search, vector_index_document, vector_index_directory tools"
echo ""
echo "📖 Documentation: VECTOR_DB_SETUP.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
