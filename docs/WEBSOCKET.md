# WebSocket Real-time Synchronization

## Overview

PUO Memo v4 includes WebSocket support for real-time synchronization across clients. This enables instant updates when memories are created, updated, or deleted, providing a seamless collaborative experience.

## Features

- **Real-time Memory Updates**: Instant notifications for create, update, delete operations
- **Tenant Isolation**: Updates are scoped to tenant boundaries
- **Channel Subscriptions**: Subscribe to specific event types
- **Connection Management**: Automatic reconnection and heartbeat
- **Scalable Architecture**: Redis pub/sub for multi-instance support

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐     Redis      ┌─────────────┐
│   Client    │ ←───────────────→ │   Server    │ ←────────────→ │   Pub/Sub   │
│ (Browser)   │                    │  Instance 1 │                 │   Channel   │
└─────────────┘                    └─────────────┘                 └─────────────┘
                                           ↑                               ↓
┌─────────────┐                    ┌─────────────┐                        ↓
│   Client    │ ←───────────────→ │   Server    │ ←──────────────────────┘
│  (Mobile)   │                    │  Instance 2 │
└─────────────┘                    └─────────────┘
```

## Connection

### WebSocket URL

```
ws://localhost:8000/ws?token={JWT_OR_API_KEY}
wss://api.puomemo.com/ws?token={JWT_OR_API_KEY}
```

### Authentication

WebSocket connections require authentication via query parameter:

```javascript
const ws = new WebSocket(`wss://api.puomemo.com/ws?token=${authToken}`);
```

## Message Protocol

### Message Structure

All messages follow this structure:

```typescript
interface WebSocketMessage {
  id: string;           // Unique message ID
  type: string;         // Message type
  timestamp: string;    // ISO 8601 timestamp
  data?: object;        // Optional payload
}
```

### Client → Server Messages

#### Subscribe to Channels
```json
{
  "type": "subscribe",
  "data": {
    "channels": ["memories", "tenant.updates"]
  }
}
```

#### Unsubscribe from Channels
```json
{
  "type": "unsubscribe",
  "data": {
    "channels": ["tenant.updates"]
  }
}
```

#### Ping (Keepalive)
```json
{
  "type": "ping"
}
```

### Server → Client Messages

#### Memory Created
```json
{
  "type": "memory.created",
  "data": {
    "memory": {
      "id": "uuid",
      "content": "New memory content",
      "title": "Memory Title",
      "tags": ["tag1", "tag2"],
      "visibility": "team",
      "created_at": "2024-01-15T10:00:00Z"
    },
    "user_id": "user-uuid",
    "user_name": "John Doe"
  }
}
```

#### Memory Updated
```json
{
  "type": "memory.updated",
  "data": {
    "memory": {
      "id": "uuid",
      "content": "Updated content",
      // ... full memory object
    },
    "user_id": "user-uuid",
    "user_name": "John Doe",
    "changes": {
      "content": "Updated content",
      "tags": ["new-tag"]
    }
  }
}
```

#### Memory Deleted
```json
{
  "type": "memory.deleted",
  "data": {
    "memory_id": "uuid",
    "title": "Deleted Memory Title",
    "user_id": "user-uuid",
    "user_name": "John Doe"
  }
}
```

#### Embedding Complete
```json
{
  "type": "memory.embedding_complete",
  "data": {
    "memory_id": "uuid",
    "embedding_model": "all-MiniLM-L6-v2"
  }
}
```

#### User Joined Tenant
```json
{
  "type": "tenant.user_joined",
  "data": {
    "user_id": "user-uuid",
    "user_name": "Jane Smith",
    "connection_id": "conn-uuid"
  }
}
```

#### User Left Tenant
```json
{
  "type": "tenant.user_left",
  "data": {
    "user_id": "user-uuid",
    "user_name": "Jane Smith",
    "connection_id": "conn-uuid"
  }
}
```

#### Subscription Confirmed
```json
{
  "type": "subscribed",
  "data": {
    "channels": ["memories", "tenant.updates"]
  }
}
```

#### Pong Response
```json
{
  "type": "pong",
  "data": {
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

#### Error
```json
{
  "type": "error",
  "data": {
    "message": "Invalid message format"
  }
}
```

## Client Implementation

### JavaScript/TypeScript

```typescript
class PuoMemoWebSocket {
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Function[]> = new Map();
  
  constructor(
    private token: string,
    private url: string = 'wss://api.puomemo.com/ws'
  ) {}
  
  connect(): void {
    const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.clearReconnectTimer();
      
      // Subscribe to channels
      this.send('subscribe', {
        channels: ['memories', 'tenant.updates']
      });
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code);
      this.scheduleReconnect();
    };
  }
  
  disconnect(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  send(type: string, data?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }
    
    const message = {
      id: this.generateId(),
      type,
      timestamp: new Date().toISOString(),
      data
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  on(event: string, handler: Function): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }
  
  off(event: string, handler: Function): void {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  private handleMessage(message: any): void {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (error) {
          console.error('Message handler error:', error);
        }
      });
    }
  }
  
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, this.reconnectInterval);
  }
  
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Usage
const ws = new PuoMemoWebSocket(authToken);

// Handle memory updates
ws.on('memory.created', (data) => {
  console.log('New memory:', data.memory);
  // Update UI
});

ws.on('memory.updated', (data) => {
  console.log('Memory updated:', data.memory);
  // Update UI
});

ws.on('memory.deleted', (data) => {
  console.log('Memory deleted:', data.memory_id);
  // Remove from UI
});

// Connect
ws.connect();
```

### React Hook

```typescript
import { useEffect, useRef, useState } from 'react';

interface UseWebSocketOptions {
  token: string;
  url?: string;
  onMemoryCreated?: (data: any) => void;
  onMemoryUpdated?: (data: any) => void;
  onMemoryDeleted?: (data: any) => void;
}

export function usePuoMemoWebSocket(options: UseWebSocketOptions) {
  const ws = useRef<PuoMemoWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    ws.current = new PuoMemoWebSocket(options.token, options.url);
    
    // Set up event handlers
    if (options.onMemoryCreated) {
      ws.current.on('memory.created', options.onMemoryCreated);
    }
    if (options.onMemoryUpdated) {
      ws.current.on('memory.updated', options.onMemoryUpdated);
    }
    if (options.onMemoryDeleted) {
      ws.current.on('memory.deleted', options.onMemoryDeleted);
    }
    
    // Connection status
    ws.current.on('subscribed', () => setIsConnected(true));
    
    // Connect
    ws.current.connect();
    
    // Cleanup
    return () => {
      ws.current?.disconnect();
    };
  }, [options.token]);
  
  return {
    isConnected,
    send: (type: string, data?: any) => ws.current?.send(type, data)
  };
}

// Usage in component
function MemoryList() {
  const [memories, setMemories] = useState<Memory[]>([]);
  
  const { isConnected } = usePuoMemoWebSocket({
    token: authToken,
    onMemoryCreated: (data) => {
      setMemories(prev => [data.memory, ...prev]);
    },
    onMemoryUpdated: (data) => {
      setMemories(prev => prev.map(m => 
        m.id === data.memory.id ? data.memory : m
      ));
    },
    onMemoryDeleted: (data) => {
      setMemories(prev => prev.filter(m => m.id !== data.memory_id));
    }
  });
  
  return (
    <div>
      {isConnected && <span>🟢 Real-time updates active</span>}
      {/* Render memories */}
    </div>
  );
}
```

### Python Client

```python
import asyncio
import json
import logging
from typing import Optional, Callable, Dict, Any
from datetime import datetime
import websockets
import uuid

logger = logging.getLogger(__name__)


class PuoMemoWebSocket:
    """WebSocket client for PUO Memo real-time updates"""
    
    def __init__(
        self,
        token: str,
        url: str = "wss://api.puomemo.com/ws",
        reconnect_interval: int = 5
    ):
        self.token = token
        self.url = url
        self.reconnect_interval = reconnect_interval
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.handlers: Dict[str, list[Callable]] = {}
        self._running = False
    
    async def connect(self):
        """Connect to WebSocket server"""
        self._running = True
        
        while self._running:
            try:
                ws_url = f"{self.url}?token={self.token}"
                async with websockets.connect(ws_url) as ws:
                    self.ws = ws
                    logger.info("WebSocket connected")
                    
                    # Subscribe to channels
                    await self.send("subscribe", {
                        "channels": ["memories", "tenant.updates"]
                    })
                    
                    # Message loop
                    async for message in ws:
                        await self._handle_message(message)
                        
            except websockets.exceptions.ConnectionClosed:
                logger.info("WebSocket disconnected")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
            
            if self._running:
                logger.info(f"Reconnecting in {self.reconnect_interval} seconds...")
                await asyncio.sleep(self.reconnect_interval)
    
    async def disconnect(self):
        """Disconnect from WebSocket server"""
        self._running = False
        if self.ws:
            await self.ws.close()
    
    async def send(self, message_type: str, data: Optional[Dict[str, Any]] = None):
        """Send message to server"""
        if not self.ws:
            logger.warning("WebSocket not connected")
            return
        
        message = {
            "id": str(uuid.uuid4()),
            "type": message_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }
        
        await self.ws.send(json.dumps(message))
    
    def on(self, event: str, handler: Callable):
        """Register event handler"""
        if event not in self.handlers:
            self.handlers[event] = []
        self.handlers[event].append(handler)
    
    async def _handle_message(self, raw_message: str):
        """Handle incoming message"""
        try:
            message = json.loads(raw_message)
            message_type = message.get("type")
            data = message.get("data")
            
            # Call registered handlers
            handlers = self.handlers.get(message_type, [])
            for handler in handlers:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(data)
                    else:
                        handler(data)
                except Exception as e:
                    logger.error(f"Handler error: {e}")
                    
        except json.JSONDecodeError:
            logger.error(f"Failed to parse message: {raw_message}")


# Usage example
async def main():
    ws = PuoMemoWebSocket(token="your-auth-token")
    
    # Register handlers
    def on_memory_created(data):
        print(f"New memory: {data['memory']['title']}")
    
    def on_memory_updated(data):
        print(f"Memory updated: {data['memory']['id']}")
    
    ws.on("memory.created", on_memory_created)
    ws.on("memory.updated", on_memory_updated)
    
    # Connect
    await ws.connect()

if __name__ == "__main__":
    asyncio.run(main())
```

## Testing

### Test Client

A test client is provided at `src/api/websocket_client.html`. To use:

1. Start the API server
2. Open the HTML file in a browser
3. Enter your authentication token
4. Click Connect

### Load Testing

```python
import asyncio
import websockets
import json
import time

async def stress_test(num_clients: int, token: str):
    """Stress test WebSocket server with multiple clients"""
    
    async def client(client_id: int):
        url = f"ws://localhost:8000/ws?token={token}"
        
        async with websockets.connect(url) as ws:
            # Subscribe
            await ws.send(json.dumps({
                "type": "subscribe",
                "data": {"channels": ["memories"]}
            }))
            
            # Send messages
            for i in range(10):
                await ws.send(json.dumps({
                    "type": "ping"
                }))
                await asyncio.sleep(1)
            
            print(f"Client {client_id} completed")
    
    # Create concurrent clients
    tasks = [client(i) for i in range(num_clients)]
    await asyncio.gather(*tasks)

# Run stress test
asyncio.run(stress_test(100, "your-token"))
```

## Performance Considerations

### Connection Limits

- Default max connections per user: 5
- Default max connections per tenant: 100
- Configurable via environment variables

### Message Size Limits

- Maximum message size: 1MB
- Messages exceeding limit are rejected

### Scaling

The WebSocket server uses Redis pub/sub for horizontal scaling:

1. Multiple API instances can run behind a load balancer
2. WebSocket connections are distributed across instances
3. Redis ensures all instances receive updates

### Resource Usage

- Each connection: ~50KB memory
- Idle connections send ping/pong every 30s
- Inactive connections timeout after 5 minutes

## Security

### Authentication

- Tokens are validated on connection
- Invalid tokens result in immediate disconnection
- Tokens are not logged or stored

### Authorization

- Updates are filtered by tenant
- Private memories are not broadcast
- Users only receive updates they have permission to see

### Rate Limiting

- Max messages per connection: 100/minute
- Violations result in temporary throttling
- Persistent violations result in disconnection

## Monitoring

### Metrics

- `puomemo_websocket_connections`: Active connections gauge
- `puomemo_websocket_messages_sent`: Messages sent counter
- `puomemo_websocket_messages_received`: Messages received counter

### Health Check

```bash
curl http://localhost:8000/api/v4/ws/status
```

Response:
```json
{
  "user_connections": 2,
  "tenant_connections": 5,
  "total_connections": 10,
  "websocket_url": "/ws"
}
```

## Error Handling

### Connection Errors

- `4001`: Authentication failed
- `4002`: Rate limit exceeded
- `4003`: Invalid message format
- `1006`: Abnormal closure

### Reconnection Strategy

1. Exponential backoff starting at 1s
2. Maximum retry interval: 60s
3. Maximum retry attempts: unlimited
4. Reset backoff on successful connection

## Best Practices

1. **Always implement reconnection logic** - Network interruptions are common
2. **Handle all message types** - Even if just logging unknown types
3. **Implement heartbeat** - Send periodic pings to detect stale connections
4. **Batch updates** - Don't update UI for every message, batch and debounce
5. **Clean up on unmount** - Always disconnect when component unmounts
6. **Use connection status** - Show users when real-time updates are active
7. **Fallback to polling** - Have a fallback for environments without WebSocket

## Future Enhancements

- Message delivery guarantees
- Presence indicators
- Typing indicators
- Custom event types
- Binary message support
- Compression
- Message history/replay