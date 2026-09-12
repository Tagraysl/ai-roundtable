param([Parameter(Mandatory=$true)][string]$PortableZip,[string]$Compiler,[switch]$DownloadCompiler)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if ($DownloadCompiler) {
    $toolDir=Join-Path $projectRoot 'vendor/inno-6.7.3'
    New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
    $setup=Join-Path $toolDir 'innosetup-6.7.3.exe'
    Invoke-WebRequest 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe' -OutFile $setup
    if ((Get-FileHash -LiteralPath $setup).Hash -ne '9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732') { throw 'Compiler checksum mismatch' }
    $install=Join-Path $toolDir 'compiler'
    $p=Start-Process -FilePath $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER',('/DIR="'+$install+'"'),'/TASKS=') -WindowStyle Hidden -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw 'Compiler setup failed' }
    $Compiler=Join-Path $install 'ISCC.exe'
}
if (-not $Compiler -or -not (Test-Path -LiteralPath $Compiler)) { throw 'Supply -Compiler or -DownloadCompiler.' }
$zip=(Resolve-Path -LiteralPath $PortableZip).Path
$line=Get-Content -LiteralPath (Join-Path (Split-Path $zip) 'SHA256SUMS.txt') | Where-Object { $_ -match ('\s+'+[regex]::Escape((Split-Path $zip -Leaf))+'$') } | Select-Object -First 1
if (-not $line -or (Get-FileHash -LiteralPath $zip).Hash -ne ($line -split '\s+')[0]) { throw 'Portable ZIP checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try { foreach($entry in $archive.Entries) { if($entry.FullName -match '(^|/)(data|qa|instance|\.git)(/|$)|(^|/)(secrets|settings|rooms|data-location)\.json$|(^|/)\.\.(/|$)') { throw 'Private or unsafe archive entry' } } } finally { $archive.Dispose() }
$stage=Join-Path $projectRoot ('dist/installer-'+[guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zip -DestinationPath $stage
$payload=Join-Path $stage 'AI-Roundtable-win-x64'
$version=(Get-Content -LiteralPath (Join-Path $payload 'resources/app/package.json') -Raw | ConvertFrom-Json).version
& $Compiler "/DPayload=$payload" "/DOutput=$stage" "/DAppVersion=$version" (Join-Path $PSScriptRoot 'installer.iss')
if($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$exe=Join-Path $stage "AI-Roundtable-$version-Setup-x64.exe"
$hash=Get-FileHash -LiteralPath $exe
"$($hash.Hash.ToLower())  $([IO.Path]::GetFileName($exe))" | Set-Content -LiteralPath (Join-Path $stage 'INSTALLER-SHA256SUMS.txt') -Encoding ASCII
Write-Output "Installer: $exe"
