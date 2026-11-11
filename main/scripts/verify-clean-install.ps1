# ExamGuard Automated Clean Installation & System Verification Script
# Verifies prerequisites, environment generation, builds, database health, and test suites.

[CmdletBinding()]
param(
    [switch]$SkipTests
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     ExamGuard Clean Installation & Integrity Verification " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
    # 1. Node.js check
    Write-Host "`n[1/6] Checking Node.js environment..." -ForegroundColor Yellow
    $nodeVersion = node --version
    Write-Host "Node version: $nodeVersion" -ForegroundColor Green

    # 2. Python environment check
    Write-Host "`n[2/6] Checking Python & Vision Virtual Environment..." -ForegroundColor Yellow
    $venvPython = Join-Path $repoRoot "services\vision\.venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $pyVersion = & $venvPython --version
        Write-Host "Vision Python Virtualenv: $pyVersion" -ForegroundColor Green
    } else {
        Write-Warning "Vision virtualenv not found at services/vision/.venv. Vision will run via system python."
    }

    # 3. No-mocks integrity check
    Write-Host "`n[3/6] Running production no-mocks integrity scan..." -ForegroundColor Yellow
    node scripts/check-no-mocks.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Production no-mocks scan failed!"
    }
    Write-Host "✓ Production source code verified clean." -ForegroundColor Green

    # 4. Monorepo TypeScript Typecheck
    Write-Host "`n[4/6] Running monorepo typecheck..." -ForegroundColor Yellow
    npm run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript typecheck failed!"
    }
    Write-Host "✓ Monorepo typecheck passed cleanly." -ForegroundColor Green

    # 5. Database Consistency Audit
    Write-Host "`n[5/6] Verifying database consistency..." -ForegroundColor Yellow
    npm run db:check
    if ($LASTEXITCODE -ne 0) {
        throw "Database consistency audit failed!"
    }
    Write-Host "✓ Database consistency audit passed cleanly." -ForegroundColor Green

    # 6. Test Suites Execution (if not skipped)
    if (-not $SkipTests) {
        Write-Host "`n[6/6] Executing test suites (Security & Vision Tools)..." -ForegroundColor Yellow
        npx vitest run test/security
        if ($LASTEXITCODE -ne 0) {
            throw "Security tests failed!"
        }
        Write-Host "✓ Security hardening test suite passed." -ForegroundColor Green

        if (Test-Path $venvPython) {
            & $venvPython -m pytest "services/vision/tests/test_tools_evaluation.py" -v
            if ($LASTEXITCODE -ne 0) {
                throw "Vision evaluation tools test suite failed!"
            }
            Write-Host "✓ Vision evaluation tools passed." -ForegroundColor Green
        }
    } else {
        Write-Host "`n[6/6] Skipping test suites as requested." -ForegroundColor Gray
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "  ExamGuard local stack is verified and ready to run!     " -ForegroundColor Green
    Write-Host "  To launch the complete application for demonstration:    " -ForegroundColor Cyan
    Write-Host "      npm run run:all                                     " -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green

} catch {
    Write-Host "`n[ERROR] Verification failed: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

