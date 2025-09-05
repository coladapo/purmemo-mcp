#!/usr/bin/env node
/**
 * Test entities endpoint directly
 */

import fetch from 'node-fetch';

const API_URL = 'https://api.purmemo.ai';
const EMAIL = 'demo@puo-memo.com';
const PASSWORD = 'demodemo123';

async function test() {
  console.log('1. Authenticating...');
  
  // Login
  const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
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
  
  if (!loginResponse.ok) {
    console.error('Login failed:', loginResponse.status);
    const text = await loginResponse.text();
    console.error(text);
    return;
  }
  
  const loginData = await loginResponse.json();
  const token = loginData.access_token;
  console.log('✓ Got token');
  
  // Test entities endpoint
  console.log('\n2. Testing /api/v5/entities...');
  
  const entitiesResponse = await fetch(`${API_URL}/api/v5/entities`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  console.log('Status:', entitiesResponse.status);
  console.log('Headers:', Object.fromEntries(entitiesResponse.headers.entries()));
  
  const responseText = await entitiesResponse.text();
  console.log('Response:', responseText);
  
  try {
    const data = JSON.parse(responseText);
    console.log('\nParsed data:');
    console.log('- Entities count:', data.entities?.length || 0);
    console.log('- Total:', data.total || 0);
    
    if (data.entities && data.entities.length > 0) {
      console.log('- First entity:', data.entities[0]);
    }
  } catch (e) {
    console.log('Failed to parse as JSON');
  }
}

test().catch(console.error);