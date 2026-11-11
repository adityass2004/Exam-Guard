# ExamGuard Setup Script (Windows PowerShell)
# Automated environment initialization and prerequisite checks.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         ExamGuard - Foundation Setup (Prompt 01)         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Prerequisite verification
Write-Host "`n[1/6] Checking system prerequisites..." -ForegroundColor Yellow

# Node.js check
try {
    $nodeVer = (node -v).Trim()
    $npmVer = (npm -v).Trim()
    Write-Host "  ✓ Node.js installed: $nodeVer (npm: $npmVer)" -ForegroundColor Green
} catch {
    Write-Error "Node.js is not found in PATH. Please install Node.js LTS (>= 20) from https://nodejs.org."
    exit 1
}

# Git check
try {
    $gitVer = (git --version).Trim()
    Write-Host "  ✓ Git installed: $gitVer" -ForegroundColor Green
} catch {
    Write-Error "Git is not found in PATH."
    exit 1
}

# Python 3.11 check
$pythonCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    try {
        $pyVer = (py -3.11 --version 2>&1).Trim()
        if ($pyVer -match "3\.11") {
            $pythonCmd = "py -3.11"
            Write-Host "  ✓ Python 3.11 launcher found: $pyVer" -ForegroundColor Green
        }
    } catch {}
}

if (-not $pythonCmd) {
    try {
        $pyDirect = (python --version 2>&1).Trim()
        if ($pyDirect -match "3\.11|3\.10") {
            $pythonCmd = "python"
            Write-Host "  ✓ Python found: $pyDirect" -ForegroundColor Green
        } else {
            Write-Warning "Python 3.11 is strongly recommended for InsightFace/ONNX wheels. Detected: $pyDirect"
            $pythonCmd = "python"
        }
    } catch {
        Write-Error "Python 3.11 was not found. Please install Python 3.11."
        exit 1
    }
}

# MySQL reachability check
Write-Host "`n[2/6] Checking MySQL service reachability (port 3306)..." -ForegroundColor Yellow
$mysqlReachable = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $tcp.BeginConnect("127.0.0.1", 3306, $null, $null)
    $success = $asyncResult.AsyncWaitHandle.WaitOne(1500, $false)
    if ($success) {
        $tcp.EndConnect($asyncResult)
        $mysqlReachable = $true
        $tcp.Close()
        Write-Host "  ✓ MySQL port 3306 is open and reachable." -ForegroundColor Green
    } else {
        $tcp.Close()
        Write-Warning '  ! MySQL port 3306 did not respond within 1500ms. If using local MySQL service, start it [net start MySQL80] or run docker compose up -d mysql.'
    }
} catch {
    Write-Warning "  ! Could not reach MySQL on 127.0.0.1:3306. Note: You will need MySQL running for DB operations."
}

# 2. Environment file (.env) creation
Write-Host "`n[3/6] Configuring environment (.env)..." -ForegroundColor Yellow
$envPath = Join-Path $PSScriptRoot "..\.env"
$envExamplePath = Join-Path $PSScriptRoot "..\.env.example"

if (Test-Path $envPath) {
    Write-Host "  ✓ Existing .env file detected. Preserving existing secrets." -ForegroundColor Cyan
} else {
    Write-Host "  -> Generating new .env with cryptographically secure keys..." -ForegroundColor Cyan
    
    # Run gen-secrets helper
    $genScript = Join-Path $PSScriptRoot "gen-secrets.mjs"
    $secretsJson = node $genScript
    $secrets = $secretsJson | ConvertFrom-Json

    $envContent = Get-Content $envExamplePath -Raw
    $envContent = $envContent.Replace("EMBEDDING_ENCRYPTION_KEY=REPLACE_ME", "EMBEDDING_ENCRYPTION_KEY=$($secrets.EMBEDDING_ENCRYPTION_KEY)")
    $envContent = $envContent.Replace("IMAGE_ENCRYPTION_KEY=REPLACE_ME", "IMAGE_ENCRYPTION_KEY=$($secrets.IMAGE_ENCRYPTION_KEY)")
    $envContent = $envContent.Replace("VISION_INTERNAL_KEY=REPLACE_ME", "VISION_INTERNAL_KEY=$($secrets.VISION_INTERNAL_KEY)")
    $envContent = $envContent.Replace("SEED_ADMIN_PASSWORD=REPLACE_ME", "SEED_ADMIN_PASSWORD=$($secrets.SEED_ADMIN_PASSWORD)")
    $envContent = $envContent.Replace("SEED_STUDENT_PASSWORD=REPLACE_ME", "SEED_STUDENT_PASSWORD=$($secrets.SEED_STUDENT_PASSWORD)")

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "  ✓ .env successfully created with generated 256-bit AES keys and random seed passwords." -ForegroundColor Green
}

# 3. Installing Node dependencies
Write-Host "`n[4/6] Installing Node.js monorepo dependencies (all workspaces)..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..")
try {
    npm install
    Write-Host "  ✓ npm install completed successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

# 4. Setting up Python virtual environment
Write-Host "`n[5/6] Setting up Python virtual environment for Vision service..." -ForegroundColor Yellow
$visionDir = Join-Path $PSScriptRoot "..\services\vision"
$venvDir = Join-Path $visionDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

Push-Location $visionDir
try {
    if (-not (Test-Path $venvPython)) {
        Write-Host "  -> Creating virtual environment in $venvDir..." -ForegroundColor Cyan
        Invoke-Expression "$pythonCmd -m venv .venv"
    }

    if (Test-Path $venvPython) {
        Write-Host "  -> Upgrading pip inside virtual environment..." -ForegroundColor Cyan
        & $venvPython -m pip install --upgrade pip --quiet
        Write-Host "  -> Installing vision dependencies from requirements.txt..." -ForegroundColor Cyan
        & $venvPython -m pip install -r requirements.txt --quiet
        Write-Host "  ✓ Python virtual environment is ready." -ForegroundColor Green
    } else {
        Write-Warning "  ! Virtual environment creation could not be verified at $venvPython."
    }
} finally {
    Pop-Location
}

# 5. Prisma generate, migrate & seed
Write-Host "`n[6/6] Initializing Database (Prisma generate, migrate & seed)..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..")
try {
    npm run db:generate
    Write-Host "  ✓ Prisma Client generated." -ForegroundColor Green

    Write-Host "  -> Applying database migrations..." -ForegroundColor Cyan
    npm run db:deploy
    Write-Host "  ✓ Database migrations applied." -ForegroundColor Green

    Write-Host "  -> Seeding initial accounts and configuration..." -ForegroundColor Cyan
    npm run db:seed
    Write-Host "  ✓ Database seed completed." -ForegroundColor Green
} finally {
    Pop-Location
}

# Read seeded accounts to display once securely
$adminEmail = "admin@examguard.local"
$adminPassword = ""
$studentEmail = "student@examguard.local"
$studentPassword = ""

if (Test-Path $envPath) {
    $lines = Get-Content $envPath
    foreach ($line in $lines) {
        if ($line -match "^SEED_ADMIN_EMAIL=(.*)$") { $adminEmail = $matches[1] }
        if ($line -match "^SEED_ADMIN_PASSWORD=(.*)$") { $adminPassword = $matches[1] }
        if ($line -match "^SEED_STUDENT_EMAIL=(.*)$") { $studentEmail = $matches[1] }
        if ($line -match "^SEED_STUDENT_PASSWORD=(.*)$") { $studentPassword = $matches[1] }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "           ExamGuard Setup Completed Successfully         " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "`n[!] SEEDED CREDENTIALS (GENERATED ONCE FOR LOCAL DEV):" -ForegroundColor Magenta
Write-Host "  Administrator Account:" -ForegroundColor Yellow
Write-Host "    Email:    $adminEmail"
Write-Host "    Password: $adminPassword"
Write-Host "`n  Student Account:" -ForegroundColor Yellow
Write-Host "    Email:    $studentEmail"
Write-Host "    Password: $studentPassword"
Write-Host "`n  WARNING: Store these credentials securely. Do not share terminal logs." -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Run 'npm run doctor' to verify all ports and services."
Write-Host "  2. Run 'npm run dev' to launch web, API, and vision processes."
Write-Host "  3. Open http://localhost:3000 to sign in."

