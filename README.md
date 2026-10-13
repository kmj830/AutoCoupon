# ⚽ FC 온라인 쿠폰 자동 수집 & 무인 등록 시스템 (AutoCoupon)

인터넷 커뮤니티(**인벤, 에펨코리아**)와 공식/중앙 서버에서 실시간으로 발행되는 **EA SPORTS FC 온라인 쿠폰 코드를 5분마다 자동으로 수집**하고, 등록된 **넥슨 계정에 무인으로 자동 등록**해 주는 프로그램입니다.

---

## 🌟 [강력 추천] 크롬 확장 프로그램 (세션 튕김 0%, 초경량 14KB)
> 평소 쓰시던 브라우저(Chrome, 네이버 웨일, Edge)의 넥슨 로그인 상태를 그대로 사용하여 **로그아웃 핑퐁 튕김 현상이 0%**입니다.

[![Download Extension ZIP](https://img.shields.io/badge/📥_확장_프로그램_ZIP_다운로드-14KB-0284c7?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/kmj830/AutoCoupon/raw/main/extension_output/FCOnline_AutoCoupon_Extension.zip)

> 👉 **[여기를 클릭하여 확장 프로그램 ZIP 다운로드](https://github.com/kmj830/AutoCoupon/raw/main/extension_output/FCOnline_AutoCoupon_Extension.zip)**  
> *(로컬 폴더 바로 열기: [`extension`](extension))*

### 🚀 확장 프로그램 1분 설치 방법 (Chrome / 웨일 / Edge 공통)
1. 브라우저 주소창에 `chrome://extensions` (웨일은 `whale://extensions`, 엣지는 `edge://extensions`) 입력 후 이동합니다.
2. 우측 상단의 **[개발자 모드]** 스위치를 **ON(켜짐)**으로 바꿉니다.
3. 좌측 상단의 **[압축해제된 확장 프로그램을 로드합니다]**를 누르고 **`extension`** 폴더(또는 압축 푼 폴더)를 선택합니다.
4. **설치 끝!** 평소처럼 넥슨에 로그인되어 있으면 브라우저가 켜져 있는 동안 **5분마다 백그라운드에서 무음으로 자동 등록**됩니다.

---

## 💻 윈도우 독립형 프로그램 (`AutoCoupon_Setup.exe`)
> 브라우저 확장 프로그램 대신 윈도우 바탕화면 독립 프로그램 실행을 원하실 경우 사용합니다.

[![Download Installer](https://img.shields.io/badge/⬇️_설치_파일_다운로드-AutoCoupon__Setup.exe-00C853?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/kmj830/AutoCoupon/raw/main/installer_output/AutoCoupon_Setup.exe)

> 👉 **[여기를 클릭하여 최신 설치 프로그램 (AutoCoupon_Setup.exe) 바로 다운로드](https://github.com/kmj830/AutoCoupon/raw/main/installer_output/AutoCoupon_Setup.exe)**

---

## 🌟 주요 특징

1. **원클릭 인스톨러 (`AutoCoupon_Setup.exe`)**:
   * 복잡한 파이썬/터미널 환경 없이 일반 윈도우 설치 프로그램처럼 한 번에 설치됩니다.
   * 윈도우 **설정 > 설치된 앱(제어판)**에서 언제든 깔끔하게 완전 삭제가 가능합니다.
2. **시각적 GUI 대시보드 (`AutoCoupon.exe`)**:
   * 바탕화면 바로가기 또는 실행 시 깔끔한 GUI 창이 제공됩니다.
   * [넥슨 간편 로그인] 버튼 하나로 OTP/로그인을 완료하면 세션이 영구 저장됩니다.
   * 윈도우 토스트 알림 ON/OFF, 5분 자동 스케줄러 등록/해제, 즉시 수집 테스트를 마우스 클릭으로 제어합니다.
3. **5분 무음 백그라운드 자동 등록 (Task Scheduler)**:
   * 윈도우 작업 스케줄러를 통해 5분마다 화면 깜빡임/콘솔 창 없이 조용히 실행되어 신규 쿠폰을 등록합니다.
4. **다중 소스 실시간 크롤링 (인벤 + 에펨코리아 + Cloudflare 백엔드)**:
   * **에펨코리아** FC 온라인 쿠폰 게시판
   * **인벤** 팁과 노하우 쿠폰 탭
   * **Cloudflare Workers 백엔드 서버**를 통한 실시간 수집 및 모바일 원격 등록 지원.
5. **윈도우 토스트 팝업 알림**:
   * 신규 쿠폰 등록 성공/실패 시 윈도우 우측 하단 네이티브 알림 팝업으로 즉시 알려줍니다 (설정창에서 토글 가능).

---

## 🚀 사용 방법

### 1단계: 설치
* `installer_output/AutoCoupon_Setup.exe`를 실행하여 안내에 따라 설치합니다.
* 설치가 완료되면 자동으로 5분 백그라운드 스케줄러가 등록되며, 바탕화면에 바로가기가 생성됩니다.

### 2단계: 넥슨 계정 1회 로그인
* 바탕화면의 **[FC 온라인 쿠폰 자동 등록기]**를 실행합니다.
* **[넥슨 간편 로그인]** 버튼을 클릭하면 브라우저가 열립니다.
* 본인 넥슨 계정으로 로그인(OTP 인증 완료 및 '로그인 상태 유지' 체크)을 완료하고 브라우저를 닫습니다.
* 상태가 `로그인 됨 (세션 정상)`으로 변경됩니다.

### 3단계: 끝!
* 이제 프로그램을 꺼도 윈도우가 **5분마다 백그라운드에서 무음으로 새 쿠폰을 자동 등록**합니다.
* 쿠폰이 등록되면 윈도우 우측 하단에 알림 팝업이 표시됩니다.

---

## 🗑️ 프로그램 삭제 (제거)
* **윈도우 설정 > 앱 > 설치된 앱** (또는 제어판 > 프로그램 추가/제거)으로 이동합니다.
* **FC 온라인 쿠폰 자동 등록기**를 찾아 **[제거]**를 누르면 등록된 5분 스케줄러와 데이터가 깔끔하게 정리됩니다.
