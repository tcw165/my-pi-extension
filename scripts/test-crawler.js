#!/usr/bin/env node

/**
 * Test Crawler with Mock Data
 * 
 * Demonstrates the Forma Help Center crawling pipeline
 * without actually hitting the live website (which has anti-bot protection).
 * 
 * Usage:
 *   node scripts/test-crawler.js
 */

const chalk = require('chalk');
const crypto = require('crypto');
const axios = require('axios');

const QDRANT_URL = process.env.VECTOR_DB_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || 'qdrant-secure-key-2024';
const COLLECTION_NAME = 'forma_help_center';

// Mock article data (simulating Forma Help Center content)
const MOCK_ARTICLES = [
  {
    url: 'https://support.joinforma.com/hc/en-us/articles/1',
    title: 'What expenses are eligible for my FSA?',
    breadcrumb: 'Help Center > Claims > Eligibility',
    content: `
## What expenses are eligible for my FSA?

### Dental
Dental care is eligible under FSA plans. This includes:
- Teeth cleaning and exams
- Fillings and crowns
- Root canals
- Orthodontics (braces)
- Dentures and dental implants

### Medical Services
Medical services and procedures are generally eligible:
- Doctor visits and consultations
- Surgery and hospital care
- Lab tests and x-rays
- Therapy sessions (physical, occupational, mental health)

### Medical Supplies  
Medical supplies and equipment are eligible:
- Bandages and gauze
- Crutches and wheelchairs
- Hearing aids
- Glasses and contact lenses
- Diabetic testing supplies

### Pharmacy & OTC
Prescription medications are always eligible. Some OTC items require:
- Allergy medications (with prescription)
- Pain relievers (with prescription)
- Antacids (with prescription)

### Vision
Vision care is eligible including:
- Eye exams
- Prescription glasses
- Contact lenses
- Eye surgery (LASIK, cataracts)

### Items Requiring Letter of Medical Necessity
Some items require a Letter of Medical Necessity (LMN) from your doctor:
- Certain vitamins and supplements
- Non-prescription pain relievers (if prescribed)
- Certain medical equipment
`
  },
  {
    url: 'https://support.joinforma.com/hc/en-us/articles/2',
    title: 'Understanding HSA contribution limits',
    breadcrumb: 'Help Center > HSA > Limits',
    content: `
## Understanding HSA contribution limits

HSA contribution limits change annually based on inflation.

### 2024 HSA Contribution Limits

For Self-Only Coverage:
- Maximum contribution: $4,150 per year
- Catch-up contribution (age 55+): Additional $1,050

For Family Coverage:
- Maximum contribution: $8,300 per year  
- Catch-up contribution (age 55+): Additional $1,050

### How to Calculate Your Contribution

If you enroll mid-year, you may be able to contribute a pro-rated amount. 
Example: Enrolling in July (7 months remaining) = (7/12) × $4,150 = $2,421.

### Employer and Employee Contributions

Both employer and employee contributions count toward the limit:
- Employer contribution: $2,000
- Employee contribution: $2,000 (remaining)
- Total: $4,000 (within $4,150 limit)

### Carryover Rules

Unlike FSAs, HSA balances roll over indefinitely:
- No "use-it-or-lose-it" rule
- Balance carries to next year
- Can be invested for growth
- Accessible at any age for qualified expenses

### Exceeding the Limit

If contributions exceed the limit:
- Excess contributions are taxable
- 6% excise tax applies to excess amount
- Must be corrected by tax filing deadline
`
  },
  {
    url: 'https://support.joinforma.com/hc/en-us/articles/3',
    title: 'How to submit a claim for reimbursement',
    breadcrumb: 'Help Center > Claims > How-To',
    content: `
## How to submit a claim for reimbursement

Forma makes it easy to submit claims and get reimbursed.

### What You Can Claim

You can claim eligible expenses from:
- Medical providers
- Pharmacies
- Dental offices
- Vision care providers
- Hospitals and clinics

### Submitting a Claim in the App

1. Open the Forma app
2. Tap "Claims" at the bottom
3. Select "New Claim"
4. Choose the account (FSA, HSA, Dependent Care)
5. Take a photo of the receipt or upload
6. Enter the amount and date
7. Select the provider/category
8. Submit

### Claim Approval Timeline

- Simple claims (Forma Card purchases): Instant approval
- Claims with receipts: 2-3 business days
- Claims requiring LMN: 5-7 business days after LMN submission

### Common Rejection Reasons

- Missing receipt
- Duplicate submission
- Non-eligible expense
- Insufficient documentation
- Missing Letter of Medical Necessity (for certain items)

### Resubmitting a Rejected Claim

1. Review the rejection reason
2. Gather required documentation
3. Tap the claim in Claims history
4. Select "Resubmit"
5. Add any missing information
6. Submit again

### Receipt Requirements

Acceptable receipts must show:
- Provider/merchant name
- Date of service
- Description of service/product
- Amount paid
`
  }
];

/**
 * Generate stable point ID from URL and section
 */
function getPointId(url, sectionIndex = 0) {
  const combined = `${url}#${sectionIndex}`;
  const hash = crypto.createHash('md5').update(combined).digest('hex');
  return BigInt(`0x${hash.slice(0, 15)}`);
}

/**
 * Simple chunking function
 */
function chunkArticle(article) {
  const { url, title, breadcrumb, content } = article;
  const MAX_CHUNK_SIZE = 1500;
  
  const chunks = [];
  const sections = content.split('\n\n');
  
  let currentChunk = `${title}\n${breadcrumb}\n\n`;
  let chunkIndex = 0;
  
  for (const section of sections) {
    if (currentChunk.length + section.length > MAX_CHUNK_SIZE && currentChunk.length > 100) {
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
  
  return chunks;
}

/**
 * Generate simple embedding from text
 */
function generateEmbedding(text) {
  // Hash-based pseudo-embedding (for demo)
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
  const embedding = new Array(384).fill(0);
  
  words.forEach((word, idx) => {
    const hash = crypto.createHash('md5').update(word).digest('hex');
    const value = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    embedding[idx % 384] += value / Math.sqrt(Math.max(words.length, 1));
  });
  
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (norm || 1));
}

/**
 * Store chunks in Qdrant
 */
async function storeInQdrant(chunks) {
  try {
    const points = chunks.map(chunk => ({
      id: Number(chunk.id % BigInt('9223372036854775807')),
      vector: chunk.embedding,
      payload: {
        url: chunk.url,
        title: chunk.title,
        breadcrumb: chunk.breadcrumb,
        content: chunk.content.slice(0, 2000),
        chunkIndex: chunk.chunkIndex,
        chunkSize: chunk.chunkSize,
        timestamp: Math.floor(Date.now() / 1000),
        contentLength: chunk.content.length
      }
    }));
    
    await axios.put(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points`,
      { points },
      { headers: { 'api-key': QDRANT_API_KEY } }
    );
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main test function
 */
async function testCrawler() {
  console.log(chalk.bold.cyan(`
╔════════════════════════════════════════════════════════╗
║         Test Crawler with Mock Data                    ║
║         (Simulates crawling without hitting site)      ║
╚════════════════════════════════════════════════════════╝
  `));
  
  try {
    // Check Qdrant connection
    console.log(chalk.cyan('🔗 Checking Qdrant connection...'));
    try {
      await axios.get(`${QDRANT_URL}/collections`, {
        headers: { 'api-key': QDRANT_API_KEY }
      });
      console.log(chalk.green(`✅ Connected to Qdrant\n`));
    } catch (error) {
      console.error(chalk.red(`❌ Cannot connect to Qdrant. Make sure docker-compose up -d\n`));
      process.exit(1);
    }
    
    // Create collection
    try {
      await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        headers: { 'api-key': QDRANT_API_KEY }
      });
      console.log(chalk.yellow(`⚠️  Collection already exists, clearing...`));
      
      // Delete and recreate
      await axios.delete(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        headers: { 'api-key': QDRANT_API_KEY }
      });
    } catch (error) {
      // Doesn't exist, that's fine
    }
    
    // Create collection
    console.log(chalk.cyan('📝 Creating collection...'));
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      vectors: {
        size: 384,
        distance: 'Cosine'
      }
    }, {
      headers: { 'api-key': QDRANT_API_KEY }
    });
    console.log(chalk.green('✅ Collection created\n'));
    
    // Process articles
    console.log(chalk.cyan(`📖 Processing ${MOCK_ARTICLES.length} mock articles...\n`));
    
    let totalChunks = 0;
    const allChunks = [];
    
    for (let i = 0; i < MOCK_ARTICLES.length; i++) {
      const article = MOCK_ARTICLES[i];
      
      // Chunk
      const chunks = chunkArticle(article);
      
      // Generate embeddings
      for (const chunk of chunks) {
        chunk.embedding = generateEmbedding(chunk.content);
        allChunks.push(chunk);
      }
      
      totalChunks += chunks.length;
      console.log(chalk.green(`  ✅ ${article.title.slice(0, 50)}`));
      console.log(chalk.gray(`     ${chunks.length} chunks, ${article.content.length} chars`));
    }
    
    console.log('');
    
    // Store
    console.log(chalk.cyan(`💾 Storing ${allChunks.length} chunks in Qdrant...`));
    const stored = await storeInQdrant(allChunks);
    
    if (stored) {
      console.log(chalk.green(`✅ Successfully stored\n`));
    } else {
      console.log(chalk.red(`❌ Failed to store\n`));
    }
    
    // Get stats
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: { 'api-key': QDRANT_API_KEY }
    });
    
    const stats = response.data.result;
    
    console.log(chalk.bold.cyan(`
╔════════════════════════════════════════════════════════╗
║                    ✅ TEST COMPLETE                     ║
╚════════════════════════════════════════════════════════╝
    `));
    
    console.log(`
Articles processed: ${chalk.green(MOCK_ARTICLES.length)}
Chunks created: ${chalk.green(totalChunks)}
Total in DB: ${chalk.green(stats.points_count)} points
Vector size: ${stats.config?.params?.vectors?.size}
Distance: ${stats.config?.params?.vectors?.distance}
    `);
    
    // Show some example searches
    console.log(chalk.bold.cyan('\n📚 Test Searches:\n'));
    
    const testQueries = [
      'FSA eligible expenses',
      'HSA contribution limits',
      'how to submit a claim'
    ];
    
    for (const query of testQueries) {
      const embedding = generateEmbedding(query);
      
      const searchResponse = await axios.post(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`,
        {
          vector: embedding,
          limit: 2,
          with_payload: true
        },
        { headers: { 'api-key': QDRANT_API_KEY } }
      );
      
      console.log(chalk.cyan(`Query: "${query}"`));
      
      if (searchResponse.data.result.length > 0) {
        searchResponse.data.result.forEach((result, idx) => {
          const score = (result.score * 100).toFixed(0);
          console.log(chalk.gray(`  ${idx + 1}. ${result.payload.title} (${score}%)`));
        });
      }
      console.log('');
    }
    
    console.log(chalk.bold.green('✨ Crawler pipeline working perfectly!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.cyan('  1. To crawl real articles, use: node scripts/crawl-forma-help-center.js'));
    console.log(chalk.cyan('  2. To search, use: pi extension with vector_search tool\n'));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Test failed: ${error.message}\n`));
    process.exit(1);
  }
}

testCrawler();
