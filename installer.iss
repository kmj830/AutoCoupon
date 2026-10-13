; Inno Setup Script for FC Online AutoCoupon
; Creates a standard Windows Setup installer with Control Panel integration

[Setup]
AppId={{E6F7A8B9-C0D1-4E2F-A3B4-5C6D7E8F9A0B}
AppName=FC 온라인 쿠폰 자동 등록기
AppVersion=1.2.0
AppPublisher=kmj830
AppPublisherURL=https://github.com/kmj830/AutoCoupon
DefaultDirName={localappdata}\Programs\AutoCoupon
DefaultGroupName=FC 온라인 쿠폰 자동 등록기
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=AutoCoupon_Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\AutoCoupon.exe
CloseApplications=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 만들기"; GroupDescription: "추가 작업:"

[Files]
Source: "dist\AutoCoupon\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\FC 온라인 쿠폰 자동 등록기"; Filename: "{app}\AutoCoupon.exe"
Name: "{group}\프로그램 제거"; Filename: "{uninstallexe}"
Name: "{userdesktop}\FC 온라인 쿠폰 자동 등록기"; Filename: "{app}\AutoCoupon.exe"; Tasks: desktopicon

[Run]
; 설치 완료 시 5분 백그라운드 스케줄러 자동 등록
Filename: "{app}\AutoCoupon.exe"; Parameters: "install"; Flags: runhidden
; 설치 완료 후 바로 설정창 실행할 수 있는 체크박스 제공
Filename: "{app}\AutoCoupon.exe"; Description: "FC 온라인 자동 쿠폰 설정창 실행"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; 제어판에서 프로그램 삭제 시 5분 스케줄러 자동 해제
Filename: "{app}\AutoCoupon.exe"; Parameters: "uninstall"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}"
