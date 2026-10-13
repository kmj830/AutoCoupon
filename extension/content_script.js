// FC Online AutoCoupon - Content Script (Document Start in MAIN world)
// 페이지 스크립트 실행 전 window.alert, window.confirm을 가로채어 
// 브라우저 팝업 창을 띄우지 않고 자동으로 [확인] 처리합니다.

window.__fcAlerts = window.__fcAlerts || [];

// 1. alert 창 가로채기 (팝업을 띄우지 않고 메시지만 기록 후 자동 닫기)
window.alert = function (msg) {
  window.__fcAlerts.push(String(msg));
  console.log("[AutoCoupon] alert 가로채기 (자동 닫힘):", msg);
};

// 2. confirm 창 가로채기 ("쿠폰을 등록하시겠습니까?" 등에 무조건 자동으로 [확인=true] 반환)
window.confirm = function (msg) {
  window.__fcAlerts.push(String(msg));
  console.log("[AutoCoupon] confirm 가로채기 (자동 확인 클릭):", msg);
  return true;
};

// 3. prompt 창 가로채기
window.prompt = function () {
  return "";
};
