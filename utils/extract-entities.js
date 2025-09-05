#!/usr/bin/env node
/**
 * Extract entities from existing memories for the demo account
 * This will populate the entities endpoint with data
 */

import fetch from 'node-fetch';

const API_URL = 'https://api.purmemo.ai';
const EMAIL = 'demo@puo-memo.com';
const PASSWORD = 'demodemo123';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Authenticate and get token
async function authenticate() {
  console.log(`${colors.cyan}Authenticating...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        username: EMAIL,
        password: PASSWORD,
        grant_type: 'password'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`${colors.green}✓ Authentication successful${colors.reset}`);
    return data.access_token;
  } catch (error) {
    console.error(`${colors.red}✗ Authentication failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Get all memories
async function getMemories(token) {
  console.log(`\n${colors.cyan}Fetching memories...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/v5/memories/?page_size=100`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch memories: ${response.status}`);
    }
    
    const data = await response.json();
    const memories = data.results || data.memories || data;
    
    console.log(`${colors.green}✓ Found ${memories.length} memories${colors.reset}`);
    return memories;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to fetch memories: ${error.message}${colors.reset}`);
    return [];
  }
}

// Simple entity extraction (client-side)
function extractEntitiesSimple(content, title = '') {
  const entities = [];
  const text = `${title} ${content}`.toLowerCase();
  
  // Extract common patterns
  const patterns = [
    // People names (simple pattern)
    { regex: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, type: 'person' },
    // URLs
    { regex: /https?:\/\/[^\s]+/g, type: 'url' },
    // Email addresses
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
    // Technologies/frameworks (common ones)
    { regex: /\b(react|vue|angular|node|python|javascript|typescript|docker|kubernetes|aws|azure|gcp)\b/gi, type: 'technology' },
    // Concepts
    { regex: /\b(api|database|server|client|frontend|backend|deployment|testing|debugging)\b/gi, type: 'concept' }
  ];
  
  for (const pattern of patterns) {
    const matches = content.match(pattern.regex) || [];
    for (const match of matches) {
      entities.push({
        name: match,
        type: pattern.type,
        confidence: 0.7
      });
    }
  }
  
  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const entity of entities) {
    const key = `${entity.name.toLowerCase()}_${entity.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entity);
    }
  }
  
  return unique;
}

// Request entity extraction from backend
async function requestEntityExtraction(token, memoryId) {
  try {
    const response = await fetch(`${API_URL}/api/v5/entities/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        memory_id: memoryId
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.extracted || 0;
    }
    
    // If the endpoint doesn't exist, return 0
    return 0;
  } catch (error) {
    return 0;
  }
}

// Check current entities
async function checkEntities(token) {
  console.log(`\n${colors.cyan}Checking current entities...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/v5/entities`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.log(`${colors.yellow}⚠ Entities endpoint returned ${response.status}${colors.reset}`);
      return { entities: [], total: 0 };
    }
    
    const data = await response.json();
    const count = data.total || data.entities?.length || 0;
    
    console.log(`${colors.green}✓ Currently have ${count} entities${colors.reset}`);
    
    if (data.entities && data.entities.length > 0) {
      console.log(`\n${colors.cyan}Sample entities:${colors.reset}`);
      data.entities.slice(0, 5).forEach(entity => {
        console.log(`  - ${entity.name} (${entity.entityType || entity.type})`);
      });
    }
    
    return data;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to check entities: ${error.message}${colors.reset}`);
    return { entities: [], total: 0 };
  }
}

// Main process
async function main() {
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}PURMEMO ENTITY EXTRACTION${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  // Authenticate
  const token = await authenticate();
  
  // Check current entities
  const beforeEntities = await checkEntities(token);
  
  // Get memories
  const memories = await getMemories(token);
  
  if (memories.length === 0) {
    console.log(`${colors.yellow}No memories found to process${colors.reset}`);
    return;
  }
  
  // Process memories for entity extraction
  console.log(`\n${colors.cyan}Processing memories for entities...${colors.reset}`);
  
  let totalEntities = 0;
  const entityTypes = {};
  
  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const entities = extractEntitiesSimple(memory.content, memory.title);
    
    if (entities.length > 0) {
      console.log(`${colors.blue}Memory ${i + 1}/${memories.length}: Found ${entities.length} entities${colors.reset}`);
      
      // Try to trigger backend extraction
      const extracted = await requestEntityExtraction(token, memory.id);
      if (extracted > 0) {
        console.log(`  ${colors.green}✓ Backend extracted ${extracted} entities${colors.reset}`);
      }
      
      totalEntities += entities.length;
      
      // Count entity types
      entities.forEach(e => {
        entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;
      });
    }
  }
  
  // Check entities after processing
  console.log(`\n${colors.cyan}Checking entities after processing...${colors.reset}`);
  const afterEntities = await checkEntities(token);
  
  // Summary
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}EXTRACTION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  console.log(`${colors.green}Memories processed: ${memories.length}${colors.reset}`);
  console.log(`${colors.green}Entities found (client-side): ${totalEntities}${colors.reset}`);
  console.log(`${colors.green}Entities before: ${beforeEntities.total || 0}${colors.reset}`);
  console.log(`${colors.green}Entities after: ${afterEntities.total || 0}${colors.reset}`);
  
  if (Object.keys(entityTypes).length > 0) {
    console.log(`\n${colors.cyan}Entity type distribution:${colors.reset}`);
    Object.entries(entityTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
  }
  
  // Notes
  console.log(`\n${colors.yellow}NOTES:${colors.reset}`);
  console.log(`1. Client-side extraction shows potential entities`);
  console.log(`2. Backend extraction requires proper AI processing`);
  console.log(`3. If entities are still empty, the backend may need:`);
  console.log(`   - Entity extraction service to be running`);
  console.log(`   - Database tables for entities to exist`);
  console.log(`   - AI API keys (Gemini/OpenAI) configured`);
  console.log(`4. Check the batch extraction script on the backend`);
}

// Run
main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});