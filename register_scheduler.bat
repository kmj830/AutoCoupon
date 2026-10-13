@echo off
chcp 65001 > nul
set TASK_NAME=FCOnlineAutoCoupon
set PYTHONW_PATH=%~dp0.venv\Scripts\pythonw.exe
set SCRIPT_PATH=%~dp0main.py

echo =======================================================
echo  FC 온라인 쿠폰 [윈도우 5분 무음 자동 스케줄러 등록]
echo =======================================================
echo.
echo * 실행 파일: %PYTHONW_PATH%
echo * 실행 인수: %SCRIPT_PATH% once
echo * 주기: 5분마다 1회 자동 실행 후 즉시 종료 (화면 깜빡임 0)
echo.

schtasks /create /tn "%TASK_NAME%" /tr "\"%PYTHONW_PATH%\" \"%SCRIPT_PATH%\" once" /sc MINUTE /mo 5 /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo [성공] 윈도우 작업 스케줄러에 등록되었습니다!
    echo 5분마다 화면 깜빡임 없이 조용히 쿠폰을 챙겨서 등록합니다.
) else (
    echo.
    echo [실패] 관리자 권한으로 실행해 주세요.
)
pause
