#!/usr/bin/env python3
"""Simple API server that just responds to health checks"""
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                "status": "healthy",
                "service": "puo-memo-api",
                "mode": "simple"
            }
            self.wfile.write(json.dumps(response).encode())
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                "service": "PUO Memo API",
                "version": "1.0.0",
                "endpoints": ["/health"]
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Reduce noise in logs
        if '/health' not in args[0]:
            super().log_message(format, *args)

if __name__ == '__main__':
    port = int(os.getenv('API_PORT', '8000'))
    server = HTTPServer(('0.0.0.0', port), HealthHandler)
    print(f"Simple API server running on port {port}")
    print(f"Health check available at http://0.0.0.0:{port}/health")
    server.serve_forever()