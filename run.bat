@echo off
chcp 65001 > nul
title FC Online AutoCoupon

echo =======================================================
echo  FC 온라인 쿠폰 자동 수집 및 등록 시스템
echo =======================================================

if not exist ".venv\Scripts\python.exe" (
    echo [알림] 가상환경이 없습니다. 가상환경을 생성합니다...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
    playwright install chromium
)

.venv\Scripts\python.exe main.py %*
if errorlevel 1 (
    pause
)
