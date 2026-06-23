# Script to start CodeGo application
Write-Host "🚀 Starting CodeGo..." -ForegroundColor Cyan

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerRunning = docker ps 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker Desktop is not running!" -ForegroundColor Red
        Write-Host "Please open Docker Desktop and wait for it to fully start, then run this script again." -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host "✅ Docker is running!" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Desktop is not running!" -ForegroundColor Red
    Write-Host "Please open Docker Desktop and wait for it to fully start, then run this script again." -ForegroundColor Yellow
    pause
    exit 1
}

# Start infrastructure services
Write-Host "`nStarting infrastructure services (Postgres, Redis, PgBouncer)..." -ForegroundColor Yellow
docker-compose up -d postgres redis redis-queue pgbouncer
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "✅ Infrastructure services started!" -ForegroundColor Green

# Wait 30 seconds for services to initialize
Write-Host "`nWaiting 30 seconds for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Seed questions
Write-Host "`nSeeding 40,000 questions..." -ForegroundColor Yellow
Set-Location backend
node seed-postgres.js
Set-Location ..

Write-Host "`n🎉 Setup complete!" -ForegroundColor Green
Write-Host "Your backend is already running and will connect automatically!" -ForegroundColor Cyan
Write-Host "`nTo start the full application later, run:" -ForegroundColor Yellow
Write-Host "  docker-compose up -d --build" -ForegroundColor White
Write-Host "`nThen open http://localhost in your browser!" -ForegroundColor Cyan
pause