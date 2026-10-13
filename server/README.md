# Cloudflare Workers 무료 쿠폰 서버 배포 가이드 (0원)

본 서버는 FC 온라인 쿠폰을 관리하고 클라이언트들에게 실시간(지연 0초)으로 배포해 주는 초경량 서버리스 백엔드입니다.

---

### 배포 방법 (웹 브라우저에서 2분 만에 완료)

1. **Cloudflare 로그인 / 가입:**
   - [dash.cloudflare.com](https://dash.cloudflare.com) 접속 (무료 계정 생성)

2. **Worker 생성:**
   - 좌측 메뉴에서 **Workers & Pages** -> **Create application** -> **Create Worker** 클릭
   - 이름 입력 (예: `fconline-coupons`) 후 **Deploy** 클릭

3. **코드 붙여넣기:**
   - 배포 완료 화면에서 **Edit code** 클릭
   - 좌측 에디터에 있는 기존 코드를 모두 지우고, [`server/worker.js`](file:///C:/Dev/AutoCoupon/server/worker.js)의 전체 코드를 복사해서 붙여넣기
   - 상단의 `ADMIN_PASSWORD = "change_this_password";` 부분을 본인이 사용할 비밀번호로 변경
   - 우측 상단 **Deploy** 클릭!

4. **클라이언트 설정 연동:**
   - 생성된 Worker URL (예: `https://fconline-coupons.내아이디.workers.dev`)을 확인합니다.
   - `config.json`의 `"server_url"`에 `https://fconline-coupons.내아이디.workers.dev/api/coupons`를 입력하면 끝!

---

### 스마트폰 모바일 쿠폰 등록

* 생성된 Worker 주소(`https://fconline-coupons.내아이디.workers.dev`)로 스마트폰 브라우저에서 접속하면 모바일 관리자 화면이 뜹니다.
* 비밀번호와 쿠폰 번호를 입력하고 **[쿠폰 배포하기]** 버튼만 누르면, 실행 중인 모든 사용자 PC에서 1분 이내에 자동으로 쿠폰이 등록됩니다!
