# ExamGuard Diagnostic Utility (scripts/doctor.ps1)
# Comprehensive health and prerequisite check.

[CmdletBinding()]
param()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                ExamGuard System Doctor                   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Runtimes
Write-Host "`n[1] Runtime Environments:" -ForegroundColor Yellow
try {
    $nodeVer = (node -v).Trim()
    $npmVer = (npm -v).Trim()
    Write-Host "  • Node.js: $nodeVer | npm: $npmVer" -ForegroundColor Green
} catch {
    Write-Host "  • Node.js: NOT FOUND" -ForegroundColor Red
}

try {
    $gitVer = (git --version).Trim()
    Write-Host "  • Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  • Git: NOT FOUND" -ForegroundColor Red
}

$venvPython = Join-Path $repoRoot "services\vision\.venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $vpyVer = (& $venvPython --version 2>&1).Trim()
    Write-Host "  • Vision .venv Python: $vpyVer" -ForegroundColor Green
} else {
    Write-Host "  • Vision .venv Python: Not found (run 'npm run setup' to build)" -ForegroundColor Yellow
}

# 2. Environment Configuration
Write-Host "`n[2] Environment Configuration (.env):" -ForegroundColor Yellow
$envPath = Join-Path $repoRoot ".env"
if (Test-Path $envPath) {
    Write-Host "  • .env file: Found" -ForegroundColor Green
    $envLines = Get-Content $envPath
    $requiredVars = @(
        "DATABASE_URL", "EMBEDDING_ENCRYPTION_KEY", "IMAGE_ENCRYPTION_KEY",
        "VISION_INTERNAL_KEY", "SEED_ADMIN_PASSWORD", "SEED_STUDENT_PASSWORD",
        "WEB_PORT", "API_PORT", "VISION_PORT"
    )
    $hasPlaceholder = $false
    foreach ($var in $requiredVars) {
        $match = $envLines | Where-Object { $_ -match "^$var=(.*)$" }
        if ($match) {
            $val = $matches[1]
            if ($val -eq "REPLACE_ME" -or [string]::IsNullOrWhiteSpace($val)) {
                Write-Host "    - $($var): Incomplete or placeholder (REPLACE_ME)" -ForegroundColor Red
                $hasPlaceholder = $true
            } else {
                Write-Host "    - $($var): Configured" -ForegroundColor Green
            }
        } else {
            Write-Host "    - $($var): Missing from .env" -ForegroundColor Red
            $hasPlaceholder = $true
        }
    }
} else {
    Write-Host "  • .env file: Missing (run 'npm run setup' to create)" -ForegroundColor Red
}

# 3. Ports & Process Status
Write-Host "`n[3] Network Ports & Service Availability:" -ForegroundColor Yellow
$ports = @(
    @{ Name = "Web Frontend"; Port = 3000 },
    @{ Name = "API Backend"; Port = 4000 },
    @{ Name = "Vision Service"; Port = 8000 },
    @{ Name = "MySQL Database"; Port = 3306 }
)

foreach ($p in $ports) {
    $portNum = $p.Port
    $name = $p.Name
    $connections = Get-NetTCPConnection -LocalPort $portNum -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = ($connections | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        Write-Host "  • Port $portNum ($name): IN USE (PID: $pids)" -ForegroundColor Cyan
    } else {
        if ($portNum -eq 3306) {
            Write-Host "  • Port $portNum ($name): NOT LISTENING (Start MySQL or Docker before running API)" -ForegroundColor Yellow
        } else {
            Write-Host "  • Port $portNum ($name): Free (Ready for service)" -ForegroundColor Green
        }
    }
}

# 4. Database Reachability & Prisma Client
Write-Host "`n[4] Database & Prisma Status:" -ForegroundColor Yellow
$prismaClientPath = Join-Path $repoRoot "node_modules\@prisma\client"
if (Test-Path $prismaClientPath) {
    Write-Host "  • Prisma Client: Generated" -ForegroundColor Green
} else {
    Write-Host "  • Prisma Client: Not found in root/api node_modules (run 'npm run db:generate')" -ForegroundColor Yellow
}

# 5. Vision Service Diagnostics (if running)
Write-Host "`n[5] Vision Service Diagnostics:" -ForegroundColor Yellow
try {
    $vHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  • Vision Health: $($vHealth.status) (Model loaded: $($vHealth.modelLoaded))" -ForegroundColor Green
} catch {
    Write-Host "  • Vision Health: Offline (Process not running on port 8000)" -ForegroundColor DarkGray
}

$modelDir = Join-Path $repoRoot "services\vision\models"
if (Test-Path $modelDir) {
    $models = Get-ChildItem -Path $modelDir -Recurse -File -Filter "*.onnx" -ErrorAction SilentlyContinue
    if ($models.Count -gt 0) {
        Write-Host "  • Model Files: Found ($($models.Count) onnx files in $modelDir)" -ForegroundColor Green
    } else {
        Write-Host "  • Model Files: buffalo_l pack not yet downloaded in $modelDir (will download on first run if enabled)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  • Model Directory: Created at $modelDir" -ForegroundColor Cyan
}

# 6. Camera Context Note
Write-Host "`n[6] Camera & Web Context:" -ForegroundColor Yellow
Write-Host "  • Web camera capture via navigator.mediaDevices.getUserMedia requires a secure context." -ForegroundColor Cyan
Write-Host "  • 'http://localhost:3000' is treated as a secure context by Chromium browsers." -ForegroundColor Green
Write-Host "  • If accessing across a local LAN IP, HTTPS must be configured." -ForegroundColor Cyan

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "              Doctor Diagnostics Complete                 " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

