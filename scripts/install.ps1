# ── Dreamer CLI installer (Windows) ──────────────────────────────────
#
# Downloads the latest prebuilt `dreamer.exe` from GitHub Releases and
# installs it to %LocalAppData%\Programs\dreamer\.
#
# Usage:
#   irm https://dreamer.dev/install.ps1 | iex
#   $env:DREAMER_VERSION = "v0.2.0"; irm ... | iex

param(
    [string]$Version = $env:DREAMER_VERSION,
    [string]$Repo    = $env:DREAMER_REPO,
    [string]$InstallDir = $env:DREAMER_INSTALL_DIR
)

$ErrorActionPreference = 'Stop'
if (-not $Version) { $Version = 'latest' }
if (-not $Repo)    { $Repo    = 'liz435/breadbox' }
if (-not $InstallDir) {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\dreamer'
}

# Platform detection
$arch = $env:PROCESSOR_ARCHITECTURE.ToLower()
switch ($arch) {
    'amd64' { $arch = 'x64' }
    'arm64' { $arch = 'arm64' }
    default { throw "Unsupported arch: $arch" }
}
$asset = "dreamer-windows-$arch.exe"

# Resolve tag
if ($Version -eq 'latest') {
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Tag = $release.tag_name
} else {
    $Tag = $Version
}

$Url = "https://github.com/$Repo/releases/download/$Tag/$asset.zip"
$ShaUrl = "https://github.com/$Repo/releases/download/$Tag/$asset.zip.sha256"

# Download
$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "dreamer-install-$(Get-Random)")
try {
    Write-Host "Downloading $asset @ $Tag ..."
    $zip = Join-Path $tmp 'dreamer.zip'
    Invoke-WebRequest -Uri $Url -OutFile $zip

    # Verify checksum (best-effort)
    try {
        $shaFile = Join-Path $tmp 'dreamer.zip.sha256'
        Invoke-WebRequest -Uri $ShaUrl -OutFile $shaFile -ErrorAction SilentlyContinue
        if (Test-Path $shaFile) {
            $expected = (Get-Content $shaFile -Raw).Split(' ')[0].Trim()
            $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
            if ($expected -ne $actual) { throw "Checksum mismatch" }
        }
    } catch { Write-Warning "Checksum verification skipped: $_" }

    # Extract
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $binary = Get-ChildItem -Path $tmp -Filter 'dreamer*.exe' | Select-Object -First 1
    if (-not $binary) { throw "dreamer.exe not found in archive" }

    # Install
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $dest = Join-Path $InstallDir 'dreamer.exe'
    Copy-Item $binary.FullName $dest -Force

    # PATH guidance
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($userPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable('Path', "$userPath;$InstallDir", 'User')
        Write-Host "Added $InstallDir to your user PATH. Open a new terminal."
    }

    Write-Host ""
    Write-Host "✓ dreamer $Tag installed to $dest"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  dreamer help                   # see commands"
    Write-Host "  dreamer setup                  # install arduino-cli"
    Write-Host "  dreamer run `"add an LED`"       # your first circuit"
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
