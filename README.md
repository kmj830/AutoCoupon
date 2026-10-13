# ⚽ FC 온라인 쿠폰 자동 수집 & 무인 등록 시스템 (AutoCoupon)

인터넷 커뮤니티(인벤 등)와 중앙 서버에서 실시간으로 발행되는 **EA SPORTS FC 온라인 쿠폰 코드를 자동으로 수집**하고, 등록된 **넥슨 계정에 24시간 무인으로 자동 등록**해 주는 프로그램입니다.

---

## 🌟 주요 특징

1. **완전 무인 자동화 (OTP / 캡차 우회)**:
   * 최초 1회만 브라우저 창에서 정상 로그인해 두면, 저장된 브라우저 세션 프로필을 영구 재사용하여 이후 사용자 개입 없이 백그라운드에서 100% 자동 등록합니다.
2. **실시간 쿠폰 수집 (인벤 + 중앙 서버)**:
   * **인벤 팁과 노하우(쿠폰 탭)**의 실시간 게시글을 정규식으로 파싱하여 자동 추출.
   * **Cloudflare Workers 백엔드 서버(무료)**와 연동하여 관리자가 스마트폰으로 배포한 쿠폰을 1분 내 자동 수신.
   * 추후 에펨코리아, 아카라이브 등 다양한 소스 추가가 가능한 플러그인(Provider) 아키텍처.
3. **중복 등록 방지 (SQLite DB)**:
   * 이미 등록을 시도했거나 성공한 쿠폰은 로컬 데이터베이스(`data/coupons.db`)에 영구 기록되어 넥슨 계정의 불필요한 중복 요청을 원천 차단합니다.
4. **실시간 알림**:
   * Windows 10/11 네이티브 토스트 팝업 알림.
   * 디스코드 웹훅(Discord Webhook) 연동 지원.

---

## 🚀 빠른 시작 가이드

### 1단계: 최초 1회 넥슨 로그인
넥슨의 2차 인증(OTP)을 통과하고 로그인 상태를 영구 저장하기 위해 아래 명령어를 실행합니다:
```bash
python main.py login
```
* 브라우저 창이 열리면 본인 넥슨 계정으로 로그인(OTP 인증 완료 및 '로그인 상태 유지' 체크)을 완료합니다.
* 로그인이 완료되면 자동으로 세션이 저장되고 브라우저가 닫힙니다.

### 2단계: 24시간 자동 감지 및 등록 시작
```bash
python main.py run
```
* 백그라운드에서 주기적으로 쿠폰을 탐색하고, 새 쿠폰이 발견되면 즉시 자동으로 등록합니다.
* 종료하려면 `Ctrl + C`를 누르시면 됩니다.

---

## 🛠 기타 명령어

| 명령어 | 설명 |
| :--- | :--- |
| `python main.py status` | 현재 넥슨 로그인 세션 유효 여부 및 최근 쿠폰 등록 내역 확인 |
| `python main.py register <코드>` | 특정 쿠폰 1개를 수동으로 즉시 등록 |
| `python main.py login` | 넥슨 로그인 세션 갱신/저장 |
| `python main.py run` | 상시 백그라운드 자동 수집/등록 실행 |

---

## ⚙️ 설정 (`config.json`)

프로젝트 루트의 `config.json`에서 자유롭게 설정을 변경할 수 있습니다:

```json
{
  "poll_interval_seconds": 180,
  "active_providers": [
    "inven",
    "server"
  ],
  "server_url": "https://내서버.workers.dev/api/coupons",
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "headless": true
}
```

* `poll_interval_seconds`: 쿠폰 탐색 주기 (기본값: 180초 = 3분)
* `active_providers`: 활성화할 쿠폰 수집기 목록 (`"inven"`, `"server"`)
* `server_url`: Cloudflare Workers 서버 주소 (모바일 배포용)
* `discord_webhook_url`: 등록 성공 시 디스코드로 알림을 받을 웹훅 주소
* `headless`: 브라우저 화면 숨김 여부 (`true`: 백그라운드 실행, `false`: 창 띄움)

---

## 📱 무료 Cloudflare Worker 서버 연동 (모바일 배포)

* [`server/README.md`](file:///C:/Dev/AutoCoupon/server/README.md) 가이드를 따라 2분 만에 무료 서버를 배포하면, 스마트폰으로 웹 페이지에서 쿠폰을 추가하는 즉시 등록된 모든 PC에서 자동 등록됩니다.
