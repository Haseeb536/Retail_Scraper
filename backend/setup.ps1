# Run from repo root: powershell -ExecutionPolicy Bypass -File backend/setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Retail Scraper Backend Setup ===" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Green
}

Write-Host "Installing npm packages..." -ForegroundColor Yellow
npm install

Write-Host "Creating SQLite database..." -ForegroundColor Yellow
npx prisma db push

Write-Host "Seeding admin user..." -ForegroundColor Yellow
npm run prisma:seed

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Start server:  npm run dev" -ForegroundColor Cyan
Write-Host "Admin login:   http://localhost:3001/admin/login" -ForegroundColor Cyan
Write-Host "Credentials:   admin@retailscraper.com / admin123" -ForegroundColor Cyan
