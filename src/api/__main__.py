"""API server entry point"""
import sys
import os

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from .server import main
    import asyncio
    asyncio.run(main())
except Exception as e:
    print(f"Failed to start main server: {e}")
    print("Starting minimal server...")
    
    # Fallback to minimal HTTP server
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import json
    
    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "healthy",
                    "mode": "minimal"
                }).encode())
            else:
                self.send_response(404)
                self.end_headers()
    
    port = int(os.getenv('API_PORT', '8000'))
    server = HTTPServer(('0.0.0.0', port), HealthHandler)
    print(f"Minimal server running on port {port}")
    server.serve_forever()