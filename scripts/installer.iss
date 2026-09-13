#ifndef Payload
  #error Payload is required
#endif
#ifndef Output
  #error Output is required
#endif
#ifndef AppVersion
  #define AppVersion "0.11.8"
#endif
[Setup]
AppId={{AF271D55-08E5-4D0A-947E-673EB620950C}
AppName=AI Roundtable
AppVersion={#AppVersion}
AppPublisher=Tagraysl
AppPublisherURL=https://github.com/Tagraysl/ai-roundtable
DefaultDirName={localappdata}\Programs\AI Roundtable
DefaultGroupName=AI Roundtable
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Output}
OutputBaseFilename=AI-Roundtable-{#AppVersion}-Setup-x64
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\AI-Roundtable.exe
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:";
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\AI Roundtable"; Filename: "{app}\AI-Roundtable.exe"; WorkingDir: "{app}"; IconFilename: "{app}\AI-Roundtable.exe"
Name: "{autodesktop}\AI Roundtable"; Filename: "{app}\AI-Roundtable.exe"; WorkingDir: "{app}"; IconFilename: "{app}\AI-Roundtable.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\AI-Roundtable.exe"; Description: "Launch AI Roundtable"; Flags: nowait postinstall skipifsilent
; No UninstallDelete wildcard: user-created data and location settings remain.
