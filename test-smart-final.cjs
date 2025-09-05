const { spawn } = require('child_process');

async function test() {
  console.log('Testing Smart Server...\n');
  
  const proc = spawn('node', ['src/smart-server.js'], {
    env: { 
      ...process.env,
      PURMEMO_API_KEY: '***REMOVED***' 
    }
  });
  
  let results = [];
  
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim().startsWith('{')) {
        try {
          const resp = JSON.parse(line);
          results.push(resp);
        } catch (e) {}
      }
    });
  });
  
  // Test 1: List tools
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'tools/list',id:1}) + '\n');
  
  // Test 2: Update context
  setTimeout(() => {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'update_context',
        arguments: {
          project: 'Test Project',
          stage: 'testing'
        }
      },
      id: 2
    }) + '\n');
  }, 200);
  
  // Test 3: Save with code
  setTimeout(() => {
    const codeContent = `Save this conversation:
\`\`\`javascript
function test() {
  console.log("Testing smart extraction");
}
\`\`\`
File: /src/test.js
URL: https://example.com`;
    
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: { content: codeContent }
      },
      id: 3
    }) + '\n');
  }, 400);
  
  // Test 4: Recall
  setTimeout(() => {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'recall',
        arguments: { query: 'test', limit: 5 }
      },
      id: 4
    }) + '\n');
  }, 600);
  
  // Check results
  setTimeout(() => {
    console.log('Results:', results.length, 'responses\n');
    
    results.forEach(r => {
      if (r.id === 1 && r.result?.tools) {
        console.log('✓ Tools:', r.result.tools.map(t => t.name).join(', '));
      }
      if (r.id === 2 && r.result?.content?.[0]?.text) {
        const text = r.result.content[0].text;
        if (text.includes('Context updated')) console.log('✓ Context updated successfully');
      }
      if (r.id === 3 && r.result?.content?.[0]?.text) {
        const text = r.result.content[0].text;
        if (text.includes('saved')) console.log('✓ Memory saved');
        if (text.includes('code') || text.includes('coding')) console.log('✓ Code auto-detected');
      }
      if (r.id === 4 && r.result?.content?.[0]?.text) {
        const text = r.result.content[0].text;
        if (text.includes('Found')) console.log('✓ Recall working');
      }
    });
    
    console.log('\nTest complete!');
    proc.kill();
    process.exit(0);
  }, 1500);
}

test();
