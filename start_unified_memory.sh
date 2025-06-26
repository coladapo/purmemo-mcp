#!/bin/bash
# Make executable: chmod +x start_unified_memory.sh
# Quick start script for PUO Unified Memory System

echo "🚀 PUO Unified Memory System - Quick Start"
echo "========================================="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Check database setup
echo "🗄️ Checking database setup..."
python3 -c "from puo_memo_simple import PuoMemoSimple; import asyncio; asyncio.run(PuoMemoSimple().initialize())" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Database not set up. Running setup..."
    python3 setup_database.py
fi

# Start API server
echo ""
echo "✅ Starting API Server..."
echo "📡 Server will run on http://localhost:8000"
echo ""
echo "Next steps:"
echo "1. Install Chrome extension from 'memorylane-extension' folder"
echo "2. Configure Claude Desktop MCP (see UNIFIED_ARCHITECTURE.md)"
echo "3. Run test: python test_unified_memory.py"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python3 api_server.py
