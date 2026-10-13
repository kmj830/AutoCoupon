@echo off
chcp 65001 > nul
set TASK_NAME=FCOnlineAutoCoupon

echo =======================================================
echo  FC 온라인 쿠폰 [윈도우 무음 자동 스케줄러 삭제]
echo =======================================================

schtasks /delete /tn "%TASK_NAME%" /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo [완료] 스케줄러가 정상적으로 삭제되었습니다.
) else (
    echo.
    echo [알림] 등록된 작업이 없거나 삭제 실패했습니다.
)
pause
