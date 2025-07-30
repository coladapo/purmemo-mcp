#!/usr/bin/env python3
"""Mock API server for MCP testing"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import uuid
from datetime import datetime
import os

# In-memory storage
memories = {}
entities = {}

class MockAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {
                "status": "healthy",
                "service": "puo-memo-api",
                "mode": "mock"
            })
        elif self.path.startswith('/api/memories/search'):
            # Parse query params
            from urllib.parse import urlparse, parse_qs
            query_params = parse_qs(urlparse(self.path).query)
            query = query_params.get('query', [''])[0]
            limit = int(query_params.get('limit', ['10'])[0])
            
            # Filter memories
            results = []
            for mem_id, memory in memories.items():
                if query.lower() in memory['content'].lower() or query.lower() in memory.get('title', '').lower():
                    results.append({
                        'id': mem_id,
                        'content': memory['content'],
                        'title': memory.get('title', ''),
                        'tags': memory.get('tags', []),
                        'created_at': memory['created_at']
                    })
            
            self.send_json(200, {
                'memories': results[:limit],
                'total': len(results)
            })
        elif self.path == '/api/entities':
            # Return all entities
            entity_list = []
            for name, entity in entities.items():
                entity_list.append({
                    'name': name,
                    'type': entity['type'],
                    'references': entity['references']
                })
            
            self.send_json(200, {
                'entities': entity_list
            })
        else:
            self.send_json(404, {"error": "Not found"})
    
    def do_POST(self):
        if self.path == '/api/memories':
            # Read body
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            # Create memory
            memory_id = str(uuid.uuid4())
            memories[memory_id] = {
                'id': memory_id,
                'content': data['content'],
                'title': data.get('title', ''),
                'tags': data.get('tags', []),
                'created_at': datetime.now().isoformat()
            }
            
            # Extract entities
            content = data['content']
            words = content.split()
            for word in words:
                if word.istitle() and len(word) > 3:
                    if word not in entities:
                        entities[word] = {
                            'type': 'concept',
                            'references': 0
                        }
                    entities[word]['references'] += 1
            
            self.send_json(200, {
                'id': memory_id,
                'status': 'created'
            })
        else:
            self.send_json(404, {"error": "Not found"})
    
    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, format, *args):
        # Reduce noise
        if '/health' not in args[0]:
            super().log_message(format, *args)

if __name__ == '__main__':
    port = int(os.getenv('API_PORT', '8001'))
    server = HTTPServer(('0.0.0.0', port), MockAPIHandler)
    print(f"Mock API server running on port {port}")
    server.serve_forever()