; Optional Inno Setup wrapper for the PowerShell installer.
; Build this on Windows with Inno Setup Compiler.

#define AppName "Ollama Windows Installer"
#define AppVersion "0.1.0"
#define PublisherName "Ten List Bible"

[Setup]
AppId={{8AEF9087-CB0D-49CB-91D1-0D94F22FE471}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#PublisherName}
DefaultDirName={localappdata}\Programs\OllamaWindowsInstaller
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=ollama-windows-installer
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
UninstallDisplayIcon={app}\ollama-windows-installer.cmd

[Files]
Source: "ollama-windows-installer.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "ollama-windows-installer.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Ollama Windows Installer"; Filename: "{app}\ollama-windows-installer.cmd"; WorkingDir: "{app}"

[Run]
Filename: "{app}\ollama-windows-installer.cmd"; Description: "Run Ollama setup now"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent
