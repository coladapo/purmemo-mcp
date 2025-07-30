#!/bin/bash
# Quick setup script for PUO Memo MCP

set -e

echo "🚀 PUO Memo MCP Setup"
echo "===================="

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

echo "✅ All prerequisites met!"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your configuration!"
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose build

# Initialize database
echo "🗄️  Initializing database..."
docker-compose up -d postgres
sleep 5
docker-compose exec postgres psql -U puo_memo -d puo_memo_db -f /docker-entrypoint-initdb.d/init.sql || true

# Start all services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to be ready..."
for i in {1..30}; do
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        echo "✅ Services are ready!"
        break
    fi
    echo -n "."
    sleep 1
done

echo "
✅ Setup complete!

🔗 Services running:
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

📚 Next steps:
1. Configure your API key in .env
2. Set up GitHub secrets (see docs/GITHUB_SETUP_GUIDE.md)
3. Run tests: docker-compose exec api pytest
4. View logs: docker-compose logs -f

🛑 To stop all services: docker-compose down
"