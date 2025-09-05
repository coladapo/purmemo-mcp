#!/usr/bin/env node
/**
 * Generate a proper API key for Purmemo
 * This will login with credentials and then create an API key
 */

async function generateAPIKey() {
  console.log('🔐 Purmemo API Key Generator\n');
  
  // First, we need to login to get a JWT token
  const email = 'demo@puo-memo.com';  // Using demo account for testing
  const password = 'demodemo123';
  
  console.log('1️⃣ Attempting login with demo account...');
  
  try {
    // Step 1: Login to get JWT token
    const loginResponse = await fetch('https://api.purmemo.ai/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email,  // OAuth2 uses 'username' field for email
        password: password,
        grant_type: 'password'
      })
    });
    
    console.log(`   Login status: ${loginResponse.status}`);
    
    if (!loginResponse.ok) {
      const error = await loginResponse.text();
      console.error(`   Login failed: ${error}`);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('   ✅ Login successful!');
    console.log(`   Access token: ${loginData.access_token.substring(0, 50)}...`);
    
    // Step 2: Create an API key using the JWT token
    console.log('\n2️⃣ Creating API key...');
    
    const apiKeyResponse = await fetch('https://api.purmemo.ai/api/v5/api-keys', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'MCP Server Key',
        permissions: {
          read: true,
          write: true
        }
      })
    });
    
    console.log(`   API key creation status: ${apiKeyResponse.status}`);
    
    if (!apiKeyResponse.ok) {
      const error = await apiKeyResponse.text();
      console.error(`   API key creation failed: ${error}`);
      
      // Try alternative endpoints
      console.log('\n3️⃣ Trying alternative API key endpoint...');
      
      const altResponse = await fetch('https://api.purmemo.ai/api/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'MCP Server Key'
        })
      });
      
      console.log(`   Alternative endpoint status: ${altResponse.status}`);
      
      if (!altResponse.ok) {
        const altError = await altResponse.text();
        console.error(`   Alternative failed: ${altError}`);
        
        // List existing keys
        console.log('\n4️⃣ Trying to list existing API keys...');
        
        const listResponse = await fetch('https://api.purmemo.ai/api/v5/api-keys', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${loginData.access_token}`
          }
        });
        
        console.log(`   List API keys status: ${listResponse.status}`);
        
        if (listResponse.ok) {
          const keys = await listResponse.json();
          console.log('   Existing keys:', JSON.stringify(keys, null, 2));
        } else {
          const listError = await listResponse.text();
          console.log(`   List failed: ${listError}`);
        }
      } else {
        const altData = await altResponse.json();
        console.log('   ✅ API key created via alternative endpoint!');
        console.log('   Full response:', JSON.stringify(altData, null, 2));
      }
    } else {
      const apiKeyData = await apiKeyResponse.json();
      console.log('   ✅ API key created successfully!');
      console.log('\n📝 SAVE THIS API KEY (shown only once):');
      console.log(`   ${apiKeyData.key || apiKeyData.api_key}`);
      console.log('\n   Key details:', JSON.stringify(apiKeyData, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

generateAPIKey();