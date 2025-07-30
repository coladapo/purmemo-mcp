const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

async function test() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '..', 'bin', 'puo-memo-mcp')],
    env: {
      PUO_MEMO_API_URL: 'http://localhost:8000',
      PUO_MEMO_API_KEY: 'test-api-key',
      PYTHONUNBUFFERED: '1'
    }
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  console.log('Connecting...');
  await client.connect(transport);
  console.log('Connected!');

  console.log('Listing tools...');
  const tools = await client.listTools();
  console.log('Tools:', tools);

  console.log('Calling memory tool...');
  const result = await client.callTool({
    name: 'memory',
    arguments: {
      content: 'Test from SDK',
      title: 'SDK Test'
    }
  });
  console.log('Result:', result);

  await client.close();
}

test().catch(console.error);