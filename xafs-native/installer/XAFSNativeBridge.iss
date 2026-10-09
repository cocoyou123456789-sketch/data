#define AppName "XAFS Native Bridge"
#define AppVersion "1.0.3"
#define AppPublisher "SynchroChemAI"
#define AppExeName "XAFSNativeBridge.exe"

[Setup]
AppId={{E0AC01B2-D1F6-45CA-BEAD-B201A91A2B9B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\SynchroChemAI\XAFSNativeBridge
DefaultGroupName=SynchroChemAI
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist-installer
OutputBaseFilename=XAFS-Native-Bridge-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}

[Files]
Source: "..\..\dist\XAFSNativeBridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\xafs-native.local.example.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\启动 XAFS 本机桥接"; Filename: "{app}\{#AppExeName}"
Name: "{group}\配置说明"; Filename: "{app}\README.md"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "XAFSNativeBridge"; ValueData: """{app}\{#AppExeName}"" --port 8766"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExeName}"; Parameters: "--port 8766"; Description: "启动 XAFS 本机桥接"; Flags: nowait postinstall skipifsilent runhidden

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM {#AppExeName} /F"; Flags: runhidden; RunOnceId: "StopBridge"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  { Stop an older bridge before replacing its executable during an upgrade. }
  Exec(ExpandConstant('{cmd}'), '/D /C taskkill /IM {#AppExeName} /F', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
