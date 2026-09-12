param([switch]$Download)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$electronVersion = $package.devDependencies.electron
$archiveName = "electron-v$electronVersion-win32-x64.zip"
$vendor = Join-Path $projectRoot 'vendor'
$archive = Join-Path $vendor $archiveName
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
if ($Download) {
    $url = "https://github.com/electron/electron/releases/download/v$electronVersion"
    Invoke-WebRequest "$url/$archiveName" -OutFile $archive
    Invoke-WebRequest "$url/SHASUMS256.txt" -OutFile (Join-Path $vendor 'SHASUMS256.txt')
}
$line = Get-Content -LiteralPath (Join-Path $vendor 'SHASUMS256.txt') | Where-Object { $_ -match ('\s+\*?' + [regex]::Escape($archiveName) + '$') } | Select-Object -First 1
if (-not $line -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne ($line -split '\s+')[0]) { throw 'Electron checksum verification failed.' }
# Always stage in a NEW directory; never package an existing installation or its data.
$stage = Join-Path $projectRoot ('dist/release-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $stage 'source'
$portable = Join-Path $stage 'AI-Roundtable-win-x64'
New-Item -ItemType Directory -Path $source | Out-Null
$sourceEntries = @('src','extension','third-party','tests','docs','package.json','README.md','README.en.md','ARCHITECTURE.md','LICENSE','.gitignore','.github')
foreach ($entry in $sourceEntries) { Copy-Item -LiteralPath (Join-Path $projectRoot $entry) -Destination $source -Recurse }
New-Item -ItemType Directory -Path (Join-Path $source 'scripts') | Out-Null
foreach ($entry in @('release.ps1','verify-release.cjs','Create-Desktop-Shortcut.ps1','Create-Desktop-Shortcut.cmd','build-installer.ps1','installer.iss')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry) -Destination (Join-Path $source 'scripts') }
Expand-Archive -LiteralPath $archive -DestinationPath $portable
Move-Item -LiteralPath (Join-Path $portable 'electron.exe') -Destination (Join-Path $portable 'AI-Roundtable.exe')
$appDir = Join-Path $portable 'resources/app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
foreach ($entry in @('src','extension','third-party','package.json','README.md','README.en.md','LICENSE')) { Copy-Item -LiteralPath (Join-Path $source $entry) -Destination $appDir -Recurse }
Copy-Item -LiteralPath (Join-Path $source 'README.md') -Destination (Join-Path $portable 'README.md')
Copy-Item -LiteralPath (Join-Path $source 'README.en.md') -Destination (Join-Path $portable 'README.en.md')
Copy-Item -LiteralPath (Join-Path $source 'docs') -Destination $portable -Recurse
Copy-Item -LiteralPath (Join-Path $source 'docs') -Destination $appDir -Recurse
foreach ($entry in @('Create-Desktop-Shortcut.ps1','Create-Desktop-Shortcut.cmd')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry) -Destination $portable }
$portableZip = Join-Path $stage "AI-Roundtable-$($package.version)-windows-x64.zip"
Compress-Archive -LiteralPath $portable -DestinationPath $portableZip
# Include hidden .github/.gitignore in the source archive using .NET.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($source, (Join-Path $stage "AI-Roundtable-$($package.version)-source.zip"))
Get-ChildItem -LiteralPath $stage -Filter '*.zip' | ForEach-Object { $h = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256; "$($h.Hash.ToLower())  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ASCII
Write-Output "Release directory: $stage"
