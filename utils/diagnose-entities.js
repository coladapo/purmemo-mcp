#!/usr/bin/env node
/**
 * PRINCIPAL ENGINEER: Deep Entities System Diagnosis
 * This script performs comprehensive analysis of entities system failures
 */

import fetch from 'node-fetch';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const EMAIL = process.env.PURMEMO_EMAIL || 'demo@puo-memo.com';
const PASSWORD = process.env.PURMEMO_PASSWORD || 'demodemo123';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
console.log(`${colors.cyan}PRINCIPAL ENGINEER: ENTITIES SYSTEM DEEP AUDIT${colors.reset}`);
console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);

async function authenticate() {
  console.log(`\n${colors.blue}🔐 Authenticating...${colors.reset}`);
  
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
    
    if (response.ok) {
      const data = await response.json();
      console.log(`${colors.green}✅ Authentication successful${colors.reset}`);
      return data.access_token;
    } else {
      const error = await response.text();
      console.log(`${colors.red}❌ Authentication failed: ${response.status} - ${error}${colors.reset}`);
      return null;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Authentication error: ${error.message}${colors.reset}`);
    return null;
  }
}

async function checkDatabaseSchema(token) {
  console.log(`\n${colors.blue}📊 PHASE 1: Database Schema Analysis${colors.reset}`);
  
  try {
    // Check database health
    const healthResponse = await fetch(`${API_URL}/health/db`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log(`${colors.green}✅ Database connection: ${health.status}${colors.reset}`);
      
      if (health.statistics) {
        console.log(`${colors.cyan}📈 Table Statistics:${colors.reset}`);
        Object.entries(health.statistics).forEach(([table, count]) => {
          const status = count === 'N/A' ? colors.red + '❌ TABLE MISSING' : colors.green + `✅ ${count} records`;
          console.log(`   ${table}: ${status}${colors.reset}`);
        });
        
        // Check if entities table exists
        if (health.statistics.entities === 'N/A') {
          console.log(`\n${colors.red}🚨 CRITICAL ISSUE: entities table does not exist${colors.reset}`);
          return { tableExists: false, schema: null };
        } else {
          console.log(`\n${colors.green}✅ entities table exists with ${health.statistics.entities} records${colors.reset}`);
          return { tableExists: true, recordCount: health.statistics.entities };
        }
      }
    } else {
      console.log(`${colors.red}❌ Database health check failed: ${healthResponse.status}${colors.reset}`);
      return { tableExists: false, error: 'Database unreachable' };
    }
  } catch (error) {
    console.log(`${colors.red}❌ Database schema check failed: ${error.message}${colors.reset}`);
    return { tableExists: false, error: error.message };
  }
}

async function testEntitiesEndpoint(token) {
  console.log(`\n${colors.blue}🔍 PHASE 2: Entities Endpoint Analysis${colors.reset}`);
  
  const endpoints = [
    { name: 'Basic entities', url: '/api/v5/entities' },
    { name: 'Entities with limit', url: '/api/v5/entities?limit=5' },
    { name: 'Person entities', url: '/api/v5/entities?type=person' },
    { name: 'MCP entities (new)', url: '/api/v5/entities' } // From mcp_endpoints.py
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    console.log(`\n${colors.cyan}Testing: ${endpoint.name}${colors.reset}`);
    console.log(`URL: ${API_URL}${endpoint.url}`);
    
    try {
      const response = await fetch(`${API_URL}${endpoint.url}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        results[endpoint.name] = { success: true, data };
        
        console.log(`${colors.green}✅ Success${colors.reset}`);
        console.log(`Response structure:`, Object.keys(data));
        
        if (data.entities) {
          console.log(`Entities count: ${data.entities.length}`);
        }
        if (data.error) {
          console.log(`${colors.yellow}⚠️ Backend error: ${data.error}${colors.reset}`);
        }
        if (data.message) {
          console.log(`Message: ${data.message}`);
        }
      } else {
        const errorText = await response.text();
        results[endpoint.name] = { success: false, status: response.status, error: errorText };
        console.log(`${colors.red}❌ Failed: ${errorText}${colors.reset}`);
      }
    } catch (error) {
      results[endpoint.name] = { success: false, error: error.message };
      console.log(`${colors.red}❌ Request failed: ${error.message}${colors.reset}`);
    }
  }
  
  return results;
}

async function analyzeEntityExtraction(token) {
  console.log(`\n${colors.blue}🧠 PHASE 3: Entity Extraction System Analysis${colors.reset}`);
  
  // Check if entity extraction endpoint exists
  try {
    const response = await fetch(`${API_URL}/api/v5/entities/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        memory_id: 'test-id'
      })
    });
    
    console.log(`Entity extraction endpoint status: ${response.status}`);
    
    if (response.status === 404) {
      console.log(`${colors.red}❌ Entity extraction endpoint missing${colors.reset}`);
      return { extractionAvailable: false };
    } else if (response.status === 422) {
      console.log(`${colors.green}✅ Entity extraction endpoint exists (validation error expected)${colors.reset}`);
      return { extractionAvailable: true };
    } else {
      const text = await response.text();
      console.log(`Unexpected response: ${text}`);
      return { extractionAvailable: false, error: text };
    }
  } catch (error) {
    console.log(`${colors.red}❌ Entity extraction test failed: ${error.message}${colors.reset}`);
    return { extractionAvailable: false, error: error.message };
  }
}

async function testMemoryCreationWithEntities(token) {
  console.log(`\n${colors.blue}💾 PHASE 4: Memory → Entity Pipeline Test${colors.reset}`);
  
  try {
    // Create a test memory with entity-rich content
    const testContent = "Meeting with John Smith from Microsoft Corporation about the Azure project in Seattle";
    
    console.log(`Creating test memory with entity-rich content...`);
    const response = await fetch(`${API_URL}/api/v5/memories/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: testContent,
        title: 'Entity Extraction Test',
        tags: ['test', 'entities', 'audit']
      })
    });
    
    if (response.ok) {
      const memory = await response.json();
      console.log(`${colors.green}✅ Memory created: ${memory.id || memory.memory_id}${colors.reset}`);
      
      // Wait a moment then check if entities were extracted
      console.log(`Waiting 2 seconds for potential entity extraction...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check entities again
      const entitiesResponse = await fetch(`${API_URL}/api/v5/entities`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (entitiesResponse.ok) {
        const entitiesData = await entitiesResponse.json();
        console.log(`Entities after memory creation: ${entitiesData.entities?.length || 0}`);
        
        if (entitiesData.entities?.length > 0) {
          console.log(`${colors.green}✅ Entities were extracted!${colors.reset}`);
          entitiesData.entities.forEach(entity => {
            console.log(`   • ${entity.name} (${entity.type || entity.entityType})`);
          });
        } else {
          console.log(`${colors.yellow}⚠️ No entities extracted from memory${colors.reset}`);
        }
      }
      
      return { memoryCreated: true, memoryId: memory.id || memory.memory_id };
    } else {
      const error = await response.text();
      console.log(`${colors.red}❌ Memory creation failed: ${error}${colors.reset}`);
      return { memoryCreated: false, error };
    }
  } catch (error) {
    console.log(`${colors.red}❌ Memory creation test failed: ${error.message}${colors.reset}`);
    return { memoryCreated: false, error: error.message };
  }
}

async function diagnoseRootCause(schemaResult, endpointResults, extractionResult, memoryResult) {
  console.log(`\n${colors.magenta}🔬 PHASE 5: ROOT CAUSE ANALYSIS${colors.reset}`);
  
  const issues = [];
  const fixes = [];
  
  // Database issues
  if (!schemaResult.tableExists) {
    issues.push("CRITICAL: entities table does not exist");
    fixes.push("Create entities table schema");
    fixes.push("Create memory_entities linking table");
  } else if (schemaResult.recordCount === 0) {
    issues.push("WARNING: entities table is empty");
    fixes.push("Enable entity extraction pipeline");
  }
  
  // Endpoint issues
  const successfulEndpoints = Object.values(endpointResults).filter(r => r.success).length;
  if (successfulEndpoints === 0) {
    issues.push("CRITICAL: All entities endpoints failing");
    fixes.push("Check entities endpoint routing in main.py");
  } else if (successfulEndpoints < Object.keys(endpointResults).length) {
    issues.push("WARNING: Some entities endpoints failing");
  }
  
  // Extraction issues
  if (!extractionResult.extractionAvailable) {
    issues.push("CRITICAL: Entity extraction system not available");
    fixes.push("Deploy entity extraction service");
    fixes.push("Configure AI models (Gemini/OpenAI) for NER");
  }
  
  // Integration issues
  if (memoryResult.memoryCreated && schemaResult.recordCount === 0) {
    issues.push("CRITICAL: Memory creation works but entities not extracted");
    fixes.push("Enable automatic entity extraction on memory save");
    fixes.push("Run batch extraction on existing memories");
  }
  
  return { issues, fixes };
}

async function generateExecutionPlan(issues, fixes) {
  console.log(`\n${colors.magenta}📋 EXECUTION PLAN FOR ENTITIES SYSTEM FIX${colors.reset}`);
  
  const plan = {
    immediate: [],
    backend: [],
    deployment: [],
    monitoring: []
  };
  
  // Categorize fixes
  fixes.forEach(fix => {
    if (fix.includes('table')) {
      plan.backend.push(fix);
    } else if (fix.includes('Deploy') || fix.includes('Configure')) {
      plan.deployment.push(fix);
    } else if (fix.includes('Enable')) {
      plan.backend.push(fix);
    } else if (fix.includes('Check')) {
      plan.immediate.push(fix);
    } else {
      plan.monitoring.push(fix);
    }
  });
  
  console.log(`\n${colors.cyan}IMMEDIATE ACTIONS:${colors.reset}`);
  plan.immediate.forEach((action, i) => {
    console.log(`${i + 1}. ${action}`);
  });
  
  console.log(`\n${colors.cyan}BACKEND DEVELOPMENT:${colors.reset}`);
  plan.backend.forEach((action, i) => {
    console.log(`${i + 1}. ${action}`);
  });
  
  console.log(`\n${colors.cyan}DEPLOYMENT TASKS:${colors.reset}`);
  plan.deployment.forEach((action, i) => {
    console.log(`${i + 1}. ${action}`);
  });
  
  console.log(`\n${colors.cyan}MONITORING & VALIDATION:${colors.reset}`);
  plan.monitoring.forEach((action, i) => {
    console.log(`${i + 1}. ${action}`);
  });
  
  return plan;
}

async function main() {
  const token = await authenticate();
  if (!token) {
    console.log(`${colors.red}❌ Cannot proceed without authentication${colors.reset}`);
    process.exit(1);
  }
  
  // Run all diagnostic phases
  const schemaResult = await checkDatabaseSchema(token);
  const endpointResults = await testEntitiesEndpoint(token);
  const extractionResult = await analyzeEntityExtraction(token);
  const memoryResult = await testMemoryCreationWithEntities(token);
  
  // Analyze root causes
  const { issues, fixes } = await diagnoseRootCause(schemaResult, endpointResults, extractionResult, memoryResult);
  
  // Generate execution plan
  const plan = await generateExecutionPlan(issues, fixes);
  
  // Final summary
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.cyan}ENTITIES SYSTEM AUDIT SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  
  console.log(`\n${colors.red}ISSUES IDENTIFIED (${issues.length}):${colors.reset}`);
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });
  
  console.log(`\n${colors.green}FIXES REQUIRED (${fixes.length}):${colors.reset}`);
  fixes.forEach((fix, i) => {
    console.log(`${i + 1}. ${fix}`);
  });
  
  console.log(`\n${colors.yellow}ENTERPRISE IMPACT:${colors.reset}`);
  console.log(`• User Experience: DEGRADED - Core feature non-functional`);
  console.log(`• Business Impact: HIGH - Knowledge management incomplete`);
  console.log(`• Technical Debt: CRITICAL - System architecture incomplete`);
  
  console.log(`\n${colors.cyan}NEXT STEPS:${colors.reset}`);
  console.log(`1. Execute immediate actions`);
  console.log(`2. Implement backend fixes`);
  console.log(`3. Deploy and configure services`);
  console.log(`4. Establish monitoring and validation`);
  
  console.log(`\n${colors.green}Detailed execution plan generated above. This analysis provides the roadmap to fix entities system permanently.${colors.reset}`);
}

main().catch(console.error);