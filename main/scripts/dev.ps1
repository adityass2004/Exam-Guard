# ExamGuard Local Development Runner (PowerShell)
# Starts Web (3000), API (4000), and Vision (8000) concurrently.

[CmdletBinding()]
param()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    Write-Host "Starting ExamGuard development processes (Web, API, Vision)..." -ForegroundColor Cyan
    npm run dev
} finally {
    Pop-Location
}

