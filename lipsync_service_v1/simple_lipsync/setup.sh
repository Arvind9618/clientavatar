#!/bin/bash

echo "🎭 LipSync Avatar - Simple Setup"
echo "================================="
echo ""

# Check Python
echo "Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ $PYTHON_VERSION"
else
    echo "❌ Python3 not found"
    echo "Please install Python 3.7 or higher"
    exit 1
fi

echo ""

# Check Rhubarb
echo "Checking Rhubarb..."
if command -v rhubarb &> /dev/null; then
    RHUBARB_VERSION=$(rhubarb --version 2>&1 | head -n 1)
    echo "✅ $RHUBARB_VERSION"
else
    echo "❌ Rhubarb not found"
    echo "Please install Rhubarb first"
    exit 1
fi

echo ""
echo "================================="
echo "Installing Python dependencies..."
echo "================================="
echo ""

pip install -r requirements.txt

echo ""
echo "================================="
echo "✅ Setup Complete!"
echo "================================="
echo ""
echo "To run the application:"
echo "  python3 app.py"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:5000"
echo ""
echo "Happy lip-syncing! 🎭"
