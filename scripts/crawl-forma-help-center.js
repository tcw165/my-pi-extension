#!/usr/bin/env node

/**
 * Forma Help Center Crawler
 * 
 * Crawls the Forma Help Center (support.joinforma.com) and indexes articles
 * into a local Qdrant vector database for semantic search.
 * 
 * Usage:
 *   node scripts/crawl-forma-help-center.js --help
 *   node scripts/crawl-forma-help-center.js --full
 *   node scripts/crawl-forma-help-center.js --url "https://support.joinforma.com/..."
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yargs = require('yargs');
const chalk = require('chalk');
const { OpenAI } = require('openai');

// Configuration
const HELP_CENTER_BASE = 'https://support.joinforma.com/hc/en-us';
const QDRANT_URL = process.env.VECTOR_DB_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || 'qdrant-secure-key-2024';
const COLLECTION_NAME = 'forma_help_center';
const DELAY_MS = 500; // ms between requests
const MAX_CHUNK_SIZE = 1500; // Approximate token limit per chunk
const CACHE_DIR = path.join(__dirname, '..', '.cache');

// Embedding configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = 'nomic-embed-text';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'text-embedding-3-small';

// Initialize OpenAI client if API key provided
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * HTTP client with retry logic
 */
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Forma-Help-Crawler/1.0 (Compatible)'
        }
      });
      return response.data;
    } catch (error) {
      if (i < maxRetries - 1) {
        const delay = (i + 1) * 1000;
        console.log(chalk.yellow(`  ⚠️  Retry ${i + 1}/${maxRetries} for ${url} after ${delay}ms`));
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate stable point ID from URL and section
 */
function getPointId(url, sectionIndex = 0) {
  const combined = `${url}#${sectionIndex}`;
  const hash = crypto.createHash('md5').update(combined).digest('hex');
  return BigInt(`0x${hash.slice(0, 15)}`);
}

/**
 * Discover all article URLs from the help center
 */
async function discoverArticles() {
  console.log(chalk.cyan('\n📚 Discovering articles...'));
  
  try {
    const html = await fetchWithRetry(HELP_CENTER_BASE);
    const $ = cheerio.load(html);
    
    const articles = new Set();
    let categoryCount = 0;
    
    // Find all category and article links
    const links = $('a[href*="/articles/"]');
    
    links.each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('/articles/')) {
        // Normalize URL
        const fullUrl = href.startsWith('http') ? href : `${HELP_CENTER_BASE}${href}`;
        articles.add(fullUrl);
      }
    });
    
    console.log(chalk.green(`✅ Found ${articles.size} articles`));
    
    return Array.from(articles);
  } catch (error) {
    console.error(chalk.red(`❌ Failed to discover articles: ${error.message}`));
    throw error;
  }
}

/**
 * Extract article content from HTML
 */
function extractArticleContent(html, url) {
  const $ = cheerio.load(html);
  
  // Get title
  const title = $('h1').first().text().trim() || 'Untitled';
  
  // Get breadcrumb for category context
  const breadcrumbs = [];
  $('a[href*="/sections/"], a[href*="/categories/"]').each((_, elem) => {
    breadcrumbs.push($(elem).text().trim());
  });
  const breadcrumb = breadcrumbs.join(' > ') || 'Help Center';
  
  // Get main article content
  const articleContent = $('article, [role="main"], .article-content').first();
  const body = articleContent.length ? articleContent.text() : $('body').text();
  
  // Clean up text
  const cleanedBody = body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  
  return {
    url,
    title,
    breadcrumb,
    content: cleanedBody,
    length: cleanedBody.length
  };
}

/**
 * Split article into chunks by sections
 */
function chunkArticle(article) {
  const chunks = [];
  const { url, title, breadcrumb, content } = article;
  
  // Try to split by headings (H2, H3)
  const sections = content.split(/(?=^#{1,3}\s)/m);
  
  let currentChunk = `${title}\n${breadcrumb}\n\n`;
  let chunkIndex = 0;
  
  for (const section of sections) {
    const sectionLength = section.length;
    
    // If adding this section would exceed max size, save current chunk
    if (currentChunk.length + sectionLength > MAX_CHUNK_SIZE && currentChunk.length > 100) {
      chunks.push({
        id: getPointId(url, chunkIndex),
        url,
        title,
        breadcrumb,
        content: currentChunk.trim(),
        chunkIndex,
        chunkSize: chunks.length
      });
      currentChunk = `${title}\n${breadcrumb}\n\n`;
      chunkIndex++;
    }
    
    currentChunk += section + '\n';
  }
  
  // Add final chunk
  if (currentChunk.trim().length > 50) {
    chunks.push({
      id: getPointId(url, chunkIndex),
      url,
      title,
      breadcrumb,
      content: currentChunk.trim(),
      chunkIndex,
      chunkSize: chunks.length
    });
  }
  
  return chunks.length > 0 ? chunks : [{
    id: getPointId(url, 0),
    url,
    title,
    breadcrumb,
    content: content.slice(0, MAX_CHUNK_SIZE * 2),
    chunkIndex: 0,
    chunkSize: 1
  }];
}

/**
 * Generate embeddings for text
 * 
 * Tries in order:
 * 1. Ollama (local, free)
 * 2. OpenAI API (if OPENAI_API_KEY set)
 * 3. Hash-based fallback (poor quality, emergency only)
 */
async function generateEmbedding(text) {
  const textSlice = text.slice(0, 8000); // Limit to 8000 chars (fits in all models)
  
  // Try 1: Ollama (local)
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: OLLAMA_MODEL,
      prompt: textSlice
    }, { timeout: 30000 });
    
    if (response.data.embedding) {
      return response.data.embedding; // 384 dims, ready to use
    }
  } catch (error) {
    // Ollama failed, try OpenAI
  }
  
  // Try 2: OpenAI API (if configured)
  if (openaiClient) {
    try {
      const response = await openaiClient.embeddings.create({
        model: OPENAI_MODEL,
        input: textSlice
      });
      
      if (response.data && response.data[0]) {
        let embedding = response.data[0].embedding; // 1,536 dims
        
        // Project from 1,536 → 384 dims to match Qdrant config
        // Simple method: keep first 384 dimensions
        // (More sophisticated: could do PCA, but this works for fallback)
        embedding = embedding.slice(0, 384);
        
        return embedding;
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  OpenAI embedding failed: ${error.message}`));
      // Fall through to hash-based
    }
  }
  
  // Try 3: Hash-based fallback (poor quality)
  console.log(chalk.yellow('  ⚠️  Using fallback hash-based embedding (poor quality)'));
  return generateFallbackEmbedding(text);
}

/**
 * Simple fallback embedding (not ideal, but better than nothing)
 * Only used if Ollama AND OpenAI are unavailable
 */
function generateFallbackEmbedding(text) {
  // Generate a pseudo-embedding based on text features
  // This is NOT a real embedding - emergency use only!
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
  const embedding = new Array(384).fill(0);
  
  if (words.length === 0) {
    return embedding;
  }
  
  // Assign word hashes to embedding dimensions
  words.forEach((word, idx) => {
    const hash = crypto.createHash('md5').update(word).digest('hex');
    const value = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    embedding[idx % 384] += value / Math.sqrt(words.length);
  });
  
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (norm || 1));
}

/**
 * Create Qdrant collection if it doesn't exist
 */
async function ensureCollection() {
  try {
    // Try to get collection
    await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: { 'api-key': QDRANT_API_KEY }
    });
    console.log(chalk.green(`✅ Collection "${COLLECTION_NAME}" already exists`));
  } catch (error) {
    if (error.response?.status === 404) {
      // Create collection
      console.log(chalk.cyan(`📝 Creating collection "${COLLECTION_NAME}"...`));
      
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        vectors: {
          size: 384,
          distance: 'Cosine'
        }
      }, {
        headers: { 'api-key': QDRANT_API_KEY }
      });
      
      console.log(chalk.green(`✅ Collection created`));
    } else {
      throw error;
    }
  }
}

/**
 * Upsert chunks into Qdrant
 */
async function storeInQdrant(chunks) {
  if (chunks.length === 0) return;
  
  console.log(chalk.cyan(`\n💾 Storing ${chunks.length} chunks in Qdrant...`));
  
  try {
    // Batch upsert points
    const points = chunks.map(chunk => ({
      id: Number(chunk.id % BigInt('9223372036854775807')), // Convert to safe int
      vector: chunk.embedding,
      payload: {
        url: chunk.url,
        title: chunk.title,
        breadcrumb: chunk.breadcrumb,
        content: chunk.content.slice(0, 2000), // Limit payload size
        chunkIndex: chunk.chunkIndex,
        chunkSize: chunk.chunkSize,
        timestamp: Math.floor(Date.now() / 1000),
        contentLength: chunk.content.length
      }
    }));
    
    const response = await axios.put(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points`,
      { points },
      { headers: { 'api-key': QDRANT_API_KEY } }
    );
    
    console.log(chalk.green(`✅ Stored ${chunks.length} chunks`));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to store in Qdrant: ${error.message}`));
    throw error;
  }
}

/**
 * Get collection stats
 */
async function getCollectionStats() {
  try {
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: { 'api-key': QDRANT_API_KEY }
    });
    
    const stats = response.data.result;
    return {
      pointCount: stats.points_count || 0,
      vectorSize: stats.config?.params?.vectors?.size || 0,
      distance: stats.config?.params?.vectors?.distance || 'Unknown'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Main crawl function
 */
async function crawlAndIndex(options = {}) {
  console.log(chalk.bold.cyan(`
╔════════════════════════════════════════════════════════╗
║   Forma Help Center → Qdrant Vector DB Crawler       ║
╚════════════════════════════════════════════════════════╝
  `));
  
  // Show embedding configuration
  console.log(chalk.cyan('⚙️  Embedding Configuration:'));
  console.log(chalk.cyan(`   Primary:  Ollama (${OLLAMA_MODEL}) @ ${OLLAMA_URL}`));
  if (openaiClient) {
    console.log(chalk.cyan(`   Fallback: OpenAI (${OPENAI_MODEL})`));
  } else {
    console.log(chalk.yellow(`   Fallback: Hash-based (poor quality)`));
    console.log(chalk.yellow(`   Tip: Set OPENAI_API_KEY for better fallback\n`));
  }
  
  const startTime = Date.now();
  
  try {
    // Ensure Qdrant is running
    console.log(chalk.cyan('🔗 Checking Qdrant connection...'));
    try {
      await axios.get(`${QDRANT_URL}/collections`, {
        headers: { 'api-key': QDRANT_API_KEY }
      });
      console.log(chalk.green(`✅ Connected to Qdrant at ${QDRANT_URL}`));
    } catch (error) {
      console.error(chalk.red(`❌ Cannot connect to Qdrant at ${QDRANT_URL}`));
      console.error(chalk.red('Make sure to run: docker-compose up -d'));
      process.exit(1);
    }
    
    // Create collection
    await ensureCollection();
    
    // Get initial stats
    let stats = await getCollectionStats();
    console.log(chalk.cyan(`📊 Current collection size: ${stats?.pointCount || 0} points\n`));
    
    // Discover articles
    let articles = [];
    if (options.url) {
      // Index single URL
      console.log(chalk.cyan(`\n🎯 Crawling single URL: ${options.url}`));
      articles = [options.url];
    } else {
      articles = await discoverArticles();
    }
    
    // Process articles
    console.log(chalk.cyan(`\n📖 Processing ${articles.length} articles...`));
    
    let totalChunks = 0;
    let successCount = 0;
    let errorCount = 0;
    const allChunks = [];
    
    for (let i = 0; i < articles.length; i++) {
      const url = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;
      
      try {
        // Fetch article
        const html = await fetchWithRetry(url);
        
        // Extract content
        const article = extractArticleContent(html, url);
        
        // Chunk content
        const chunks = chunkArticle(article);
        
        // Generate embeddings for each chunk
        for (const chunk of chunks) {
          const embedding = await generateEmbedding(chunk.content);
          chunk.embedding = embedding;
          allChunks.push(chunk);
        }
        
        totalChunks += chunks.length;
        successCount++;
        
        console.log(chalk.green(`  ${progress} ✅ ${article.title.slice(0, 60)}`));
        
        // Delay between requests
        await sleep(DELAY_MS);
      } catch (error) {
        errorCount++;
        console.log(chalk.red(`  ${progress} ❌ Failed: ${url.slice(-50)}`));
      }
    }
    
    // Store all chunks in Qdrant
    if (allChunks.length > 0) {
      await storeInQdrant(allChunks);
    }
    
    // Get final stats
    stats = await getCollectionStats();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(chalk.bold.cyan(`\n╔════════════════════════════════════════════════════════╗`));
    console.log(chalk.bold.cyan(`║                    ✅ CRAWL COMPLETE                     ║`));
    console.log(chalk.bold.cyan(`╚════════════════════════════════════════════════════════╝`));
    console.log(`
Articles processed: ${chalk.green(successCount)}/${articles.length}
Failed: ${chalk.red(errorCount)}
Chunks created: ${chalk.green(totalChunks)}
Total in DB: ${chalk.green(stats?.pointCount || 0)} points
Vector size: ${stats?.vectorSize || 384}
Distance metric: ${stats?.distance || 'Cosine'}
Time elapsed: ${chalk.cyan(elapsed + 's')}
    `);
    
    console.log(chalk.cyan('Next step: Use vector_search tool to find articles by topic'));
    console.log(chalk.cyan(`Example: "FSA eligible expenses", "HSA limits", "claims procedure"`));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Crawl failed: ${error.message}`));
    process.exit(1);
  }
}

/**
 * CLI argument parsing
 */
const argv = yargs(process.argv.slice(2))
  .option('full', {
    alias: 'f',
    type: 'boolean',
    description: 'Full crawl (default)',
    default: true
  })
  .option('url', {
    alias: 'u',
    type: 'string',
    description: 'Crawl single article URL'
  })
  .option('help', {
    alias: 'h',
    type: 'boolean',
    description: 'Show help'
  })
  .argv;

// Run
if (argv.help || argv.h) {
  console.log(`
Forma Help Center Crawler

Usage:
  node scripts/crawl-forma-help-center.js [options]

Options:
  --full, -f           Full crawl of all articles (default)
  --url, -u <url>     Crawl single article URL
  --help, -h          Show this help message

Examples:
  node scripts/crawl-forma-help-center.js --full
  node scripts/crawl-forma-help-center.js --url "https://support.joinforma.com/hc/en-us/articles/..."

Requirements:
  - Qdrant running on http://localhost:6333
  - (Optional) Ollama running on http://localhost:11434 for local embeddings
  - Environment: VECTOR_DB_URL, QDRANT_API_KEY
  `);
} else {
  crawlAndIndex({ url: argv.url }).catch(error => {
    console.error('\x1b[31m❌ Error: ' + (error?.message || error) + '\x1b[0m');
    process.exit(1);
  });
}

module.exports = { crawlAndIndex, discoverArticles, chunkArticle, generateEmbedding };
