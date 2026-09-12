$ErrorActionPreference = 'Stop'
try {
    $exe = Join-Path $PSScriptRoot 'AI-Roundtable.exe'
    if (-not (Test-Path -LiteralPath $exe)) { throw 'Extract the entire ZIP before creating a shortcut.' }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $ws = New-Object -ComObject WScript.Shell
    for ($i = 0; $i -lt 100; $i++) {
        $name = if ($i -eq 0) { 'AI Roundtable.lnk' } else { "AI Roundtable ($($i+1)).lnk" }
        $link = Join-Path $desktop $name
        $shortcut = $ws.CreateShortcut($link)
        if ((Test-Path -LiteralPath $link) -and $shortcut.TargetPath -ne $exe) { continue }
        $shortcut.TargetPath = $exe
        $shortcut.WorkingDirectory = $PSScriptRoot
        $shortcut.IconLocation = "$exe,0"
        $shortcut.Description = 'AI Roundtable'
        $shortcut.Save()
        Write-Host 'Desktop shortcut created. If you move the app folder, run this again.'
        exit 0
    }
    throw 'No available shortcut name.'
} catch { Write-Host $_.Exception.Message; exit 1 }
