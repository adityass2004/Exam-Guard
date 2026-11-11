# ExamGuard Database Reset Script (PowerShell)
# Drops and recreates development database once migrations are configured in Prompt 02.

[CmdletBinding()]
param(
    [switch]$Force
)

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "              ExamGuard - Database Reset                  " -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Red
Write-Host "WARNING: This operation is destructive and will erase all data in the development database." -ForegroundColor Yellow

# Refuse reset in production
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    $isProd = Get-Content $envFile | Where-Object { $_ -match "^NODE_ENV=production" }
    if ($isProd -or $env:NODE_ENV -eq "production") {
        Write-Error "Database reset refused: NODE_ENV is set to production."
        exit 1
    }
}

if (-not $Force) {
    $confirm = Read-Host "Are you sure you want to completely reset the database? (type 'yes' to proceed)"
    if ($confirm -ne 'yes') {
        Write-Host "Reset aborted by user." -ForegroundColor Cyan
        exit 0
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    Write-Host "Executing 'npx prisma migrate reset --force --schema=apps/api/prisma/schema.prisma'..." -ForegroundColor Yellow
    npx prisma migrate reset --force --schema=apps/api/prisma/schema.prisma
    Write-Host "[OK] Database reset and seeded successfully." -ForegroundColor Green
} finally {
    Pop-Location
}
