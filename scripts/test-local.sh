#!/bin/bash
# Local Development Test Script

set -e

echo "🚀 Starting PUO Memo local development environment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your actual values!"
    echo "Press Enter to continue..."
    read
fi

# Start services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis

# Wait for services
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check postgres
echo "🔍 Checking PostgreSQL..."
docker-compose exec postgres pg_isready -U puo_memo -d puo_memo_db

# Check redis
echo "🔍 Checking Redis..."
docker-compose exec redis redis-cli ping

# Run API in development mode
echo "🚀 Starting API server..."
docker-compose up -d api

# Wait for API
echo "⏳ Waiting for API to be ready..."
for i in {1..30}; do
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        echo "✅ API is ready!"
        break
    fi
    echo -n "."
    sleep 1
done

# Show logs
echo "📋 Recent logs:"
docker-compose logs --tail=20

echo "
✅ Local development environment is ready!

📍 Services:
- API: http://localhost:8000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

🛠  Useful commands:
- View logs: docker-compose logs -f
- Stop all: docker-compose down
- Reset database: docker-compose down -v && docker-compose up -d
- Run MCP server: docker-compose run --rm mcp

📚 API Documentation: http://localhost:8000/docs
"