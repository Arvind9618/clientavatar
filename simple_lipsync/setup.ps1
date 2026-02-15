# LipSync Avatar - Windows Setup Script (PowerShell)
# ===============================================

Write-Host "🎭 LipSync Avatar - Simple Setup (Windows)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Python
Write-Host "Checking Python..."
try {
    $pythonVersion = & python --version 2>&1
    Write-Host "✅ $pythonVersion"
} catch {
    Write-Host "❌ Python not found." -ForegroundColor Red
    Write-Host "Please install Python 3.7+ from python.org and ensure 'Add to PATH' is checked." -ForegroundColor Yellow
    exit 1
}

# 2. Check Rhubarb
Write-Host ""
Write-Host "Checking Rhubarb..."
try {
    $rhubarbVersion = & rhubarb --version 2>&1 | Select-Object -First 1
    Write-Host "✅ $rhubarbVersion"
} catch {
    Write-Host "❌ Rhubarb not found in PATH." -ForegroundColor Red
    Write-Host "Manual Step Required:" -ForegroundColor Yellow
    Write-Host "1. Download Rhubarb Lip Sync from: https://github.com/DanielSWolf/rhubarb-lip-sync/releases"
    Write-Host "2. Extract the .zip file."
    Write-Host "3. Add the extracted folder to your Windows Path environment variable."
    Write-Host ""
    Write-Host "After installing Rhubarb, please restart your terminal and run this script again."
    exit 1
}

# 3. Create Virtual Environment (Optional but Recommended)
Write-Host ""
Write-Host "================================="
Write-Host "Setting up Python environment..."
Write-Host "================================="

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
}

Write-Host "Activating virtual environment..."
& .\venv\Scripts\Activate.ps1

# 4. Install Dependencies
Write-Host "Installing Python dependencies (Flask, etc.)..."
pip install -r requirements.txt

Write-Host ""
Write-Host "=================================" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""
Write-Host "To run the application:"
Write-Host "  python app.py"
Write-Host ""
Write-Host "Then open your browser to:"
Write-Host "  http://localhost:5000"
Write-Host ""
Write-Host "Happy lip-syncing! 🎭" -ForegroundColor Cyan
