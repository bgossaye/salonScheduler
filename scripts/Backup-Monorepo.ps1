param(
    [string]$ProjectRoot = "C:\Users\15853\Documents\salon-booking-app",
    [string]$OutputFolder = "C:\Users\15853\Documents"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "Project folder not found: $ProjectRoot"
}

Push-Location $ProjectRoot

try {
    $gitRoot = (git rev-parse --show-toplevel 2>$null).Trim()

    if (-not $gitRoot) {
        throw "This folder is not inside a Git repository."
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $zipName = "salon-booking-app-clean-$timestamp.zip"
    $destination = Join-Path $OutputFolder $zipName
    $tempRoot = Join-Path $env:TEMP "salon-booking-app-clean-$timestamp"

    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

    # Includes tracked, modified, and untracked files not excluded by .gitignore.
    # Excludes .git and anything ignored by Git such as node_modules,
    # build/dist folders, environment files, and generated logs.
    $files = git ls-files --cached --others --exclude-standard

    foreach ($relativePath in $files) {
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            continue
        }

        $source = Join-Path $gitRoot $relativePath

        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            continue
        }

        $target = Join-Path $tempRoot $relativePath
        $targetDirectory = Split-Path -Parent $target

        if ($targetDirectory) {
            New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
        }

        Copy-Item -LiteralPath $source -Destination $target -Force
    }

    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Force
    }

    Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $destination -Force

    Write-Host ""
    Write-Host "Backup created successfully:"
    Write-Host $destination
}
finally {
    Pop-Location

    if ($tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
