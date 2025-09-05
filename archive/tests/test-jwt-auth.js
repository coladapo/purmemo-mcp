#!/usr/bin/env node
/**
 * Test JWT authentication directly
 */

async function testJWTAuth() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ODJkMjVjZC01OTJjLTRmZDctOTBhMC03NDM1YTEwMjQ0ZDMiLCJ0eXBlIjoiYXBpX2tleSIsImtleV9pZCI6IjhjNDBiOTgyLTc2ZmItNDgyNi05N2Q2LWQ4MTBiZGYyYTkxOCIsImV4cCI6MTc4NzE1ODI0MH0.Qqa-JXrsYhR88mHGK7gf7s1SuTrNIXYyneOkRBT_oUQ';
  
  // Parse JWT payload
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  
  console.log('JWT Payload:', JSON.stringify(payload, null, 2));
  console.log('Token type:', payload.type);
  console.log('Expiry:', new Date(payload.exp * 1000).toISOString());
  console.log('Is expired?', Date.now() > payload.exp * 1000);
  
  // Test different auth approaches
  const tests = [
    {
      name: 'JWT as Bearer token',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    },
    {
      name: 'Direct token',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    },
    {
      name: 'X-API-Key header',
      headers: {
        'X-API-Key': token,
        'Content-Type': 'application/json'
      }
    }
  ];
  
  console.log('\n🧪 Testing authentication methods:\n');
  
  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    
    try {
      const response = await fetch('https://api.purmemo.ai/api/v5/memories/', {
        method: 'GET',
        headers: test.headers
      });
      
      console.log(`  Status: ${response.status}`);
      
      if (response.status === 401) {
        const error = await response.text();
        console.log(`  Error: ${error}`);
      } else if (response.ok) {
        console.log('  ✅ Authentication successful!');
        const data = await response.json();
        console.log(`  Response: ${JSON.stringify(data).substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`  ❌ Network error: ${error.message}`);
    }
    
    console.log();
  }
  
  // Try to decode what the backend might expect
  console.log('🔍 Analysis:');
  console.log('- This appears to be a JWT token for API key authentication');
  console.log('- It has type: "api_key" and key_id in the payload');
  console.log('- But the backend expects actual API keys starting with "pk_"');
  console.log('- This token was likely meant for a different auth flow');
}

testJWTAuth().catch(console.error);