#!/usr/bin/env node
/**
 * Verify API fixes are working correctly
 * Tests the actual API endpoints directly
 */

import fetch from 'node-fetch';

const API_URL = 'https://api.purmemo.ai';
const EMAIL = 'demo@puo-memo.com';
const PASSWORD = 'demodemo123';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function authenticate() {
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
  return data.access_token;
}

async function testMemoryCreation(token) {
  console.log(`\n${colors.blue}Testing Memory Creation (POST /api/v5/memories/)...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/v5/memories/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'API fix verification test',
        title: 'Fix Test',
        tags: ['api-test']
      })
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`${colors.green}  ✅ SUCCESS - Memory created with ID: ${data.id || data.memory_id}${colors.reset}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`${colors.red}  ❌ FAILED - ${text}${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ ERROR - ${error.message}${colors.reset}`);
    return false;
  }
}

async function testRecallOldWay(token) {
  console.log(`\n${colors.blue}Testing OLD Recall Method (POST /api/v5/memories/search)...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/v5/memories/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'test',
        page_size: 10
      })
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 405) {
      console.log(`${colors.yellow}  ⚠️ EXPECTED - 405 Method Not Allowed (incorrect endpoint)${colors.reset}`);
    } else if (response.ok) {
      console.log(`${colors.yellow}  ⚠️ UNEXPECTED - Old method still works${colors.reset}`);
    } else {
      const text = await response.text();
      console.log(`  Response: ${text.substring(0, 100)}`);
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
}

async function testRecallNewWay(token) {
  console.log(`\n${colors.blue}Testing NEW Recall Method (GET /api/v5/memories/?query=...)...${colors.reset}`);
  
  try {
    const params = new URLSearchParams({
      query: 'test',
      page_size: '10'
    });
    
    const response = await fetch(`${API_URL}/api/v5/memories/?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      const memories = data.results || data.memories || data;
      const count = Array.isArray(memories) ? memories.length : 0;
      console.log(`${colors.green}  ✅ SUCCESS - Found ${count} memories${colors.reset}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`${colors.red}  ❌ FAILED - ${text}${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ ERROR - ${error.message}${colors.reset}`);
    return false;
  }
}

async function testEntities(token) {
  console.log(`\n${colors.blue}Testing Entities (GET /api/v5/entities)...${colors.reset}`);
  
  try {
    const response = await fetch(`${API_URL}/api/v5/entities`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.error) {
        console.log(`${colors.yellow}  ⚠️ Backend Issue: ${data.error}${colors.reset}`);
        return 'backend-issue';
      } else if (data.entities && data.entities.length === 0) {
        console.log(`${colors.green}  ✅ SUCCESS - Endpoint works (0 entities - expected)${colors.reset}`);
        return true;
      } else if (data.entities && data.entities.length > 0) {
        console.log(`${colors.green}  ✅ SUCCESS - Found ${data.entities.length} entities${colors.reset}`);
        return true;
      }
    } else {
      const text = await response.text();
      console.log(`${colors.red}  ❌ FAILED - ${text}${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ ERROR - ${error.message}${colors.reset}`);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}PURMEMO API FIX VERIFICATION${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  console.log(`\n${colors.cyan}Authenticating...${colors.reset}`);
  
  try {
    const token = await authenticate();
    console.log(`${colors.green}✅ Authentication successful${colors.reset}`);
    
    // Run tests
    const results = {
      memory: await testMemoryCreation(token),
      recall_old: false, // Expected to fail
      recall_new: await testRecallNewWay(token),
      entities: await testEntities(token)
    };
    
    // Test old recall method (should fail)
    await testRecallOldWay(token);
    
    // Summary
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}VERIFICATION SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    
    console.log(`\n${colors.cyan}API Endpoint Status:${colors.reset}`);
    console.log(`  Memory Creation (POST): ${results.memory ? colors.green + '✅ WORKING' : colors.red + '❌ BROKEN'}${colors.reset}`);
    console.log(`  Recall/Search (GET):    ${results.recall_new ? colors.green + '✅ WORKING' : colors.red + '❌ BROKEN'}${colors.reset}`);
    console.log(`  Entities (GET):         ${results.entities === true ? colors.green + '✅ WORKING' : results.entities === 'backend-issue' ? colors.yellow + '⚠️ BACKEND SETUP NEEDED' : colors.red + '❌ BROKEN'}${colors.reset}`);
    
    console.log(`\n${colors.cyan}Fix Status:${colors.reset}`);
    console.log(`  405 Error Fix: ${results.recall_new ? colors.green + '✅ CONFIRMED' : colors.red + '❌ NOT WORKING'}${colors.reset}`);
    console.log(`  Authentication: ${colors.green}✅ WORKING${colors.reset}`);
    
    console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
    console.log(`1. Use server-final.js in Claude Desktop`);
    console.log(`2. Restart Claude Desktop`);
    console.log(`3. All memory tools should work`);
    
    if (results.entities === 'backend-issue') {
      console.log(`\n${colors.yellow}Note: Entity extraction requires backend database setup${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`${colors.red}Authentication failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main().catch(console.error);