#!/bin/bash

# Setup virtual environment for PUO Memo MCP

set -e

VENV_DIR="$HOME/.puo-memo-mcp/venv"
PYTHON_CMD=${PYTHON_CMD:-python3}

echo "Setting up PUO Memo MCP virtual environment..."

# Create venv directory
mkdir -p "$(dirname "$VENV_DIR")"

# Create virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR"
    $PYTHON_CMD -m venv "$VENV_DIR"
fi

# Activate venv
if [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
elif [ -f "$VENV_DIR/Scripts/activate" ]; then
    source "$VENV_DIR/Scripts/activate"
fi

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install aiohttp pydantic python-dotenv requests

echo "✓ Virtual environment setup complete!"
echo ""
echo "Virtual environment location: $VENV_DIR"
echo "Python executable: $VENV_DIR/bin/python"