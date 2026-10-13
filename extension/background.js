// FC Online AutoCoupon - Background Service Worker (Manifest V3)

const API_URL = "https://fc-coupon-api.alswnd0830.workers.dev/api/coupons";
const COUPON_URL = "https://fconline.nexon.com/coupon";
const ALARM_NAME = "fconline_check_coupons";

// 1. 설치 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AutoCoupon] 확장 프로그램이 설치되었습니다.");
  
  const current = await chrome.storage.local.get(["auto_check", "notify", "history", "registered_codes"]);
  await chrome.storage.local.set({
    auto_check: current.auto_check !== undefined ? current.auto_check : true,
    notify: current.notify !== undefined ? current.notify : true,
    history: current.history || [],
    registered_codes: current.registered_codes || {},
    last_check_time: null,
    is_running: false
  });

  // 5분 주기 알람 설정
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });

  // 3초 후 첫 탐색 즉시 시작
  setTimeout(() => {
    checkAndApplyCoupons();
  }, 3000);
});

// 2. 알람 트리거 (5분마다 실행)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    checkAndApplyCoupons();
  }
});

// 3. 팝업 등 외부 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "RUN_NOW") {
    checkAndApplyCoupons().then(result => sendResponse(result));
    return true;
  }
  if (message.action === "REGISTER_CODE") {
    applySingleCoupon(message.code).then(result => sendResponse(result));
    return true;
  }
});

// 4. 쿠폰 수집 및 등록 메인 로직
async function checkAndApplyCoupons() {
  const { auto_check, registered_codes = {} } = await chrome.storage.local.get(["auto_check", "registered_codes"]);
  if (auto_check === false) {
    console.log("[AutoCoupon] 자동 등록이 일시 중지되어 있습니다.");
    return { success: false, message: "자동 등록이 OFF 상태입니다." };
  }

  await chrome.storage.local.set({ is_running: true, last_check_time: new Date().toLocaleTimeString("ko-KR") });

  try {
    // 중앙 API에서 쿠폰 목록 가져오기
    const resp = await fetch(API_URL);
    if (!resp.ok) throw new Error("서버 응답 오류: " + resp.status);
    const codes = await resp.json();

    if (!Array.isArray(codes) || codes.length === 0) {
      console.log("[AutoCoupon] 등록 가능한 신규 쿠폰이 없습니다.");
      await chrome.storage.local.set({ is_running: false });
      return { success: true, count: 0 };
    }

    // 아직 등록 시도하지 않은 새 쿠폰만 필터링 (한 번에 최대 10개)
    const targetCodes = codes.filter(c => !registered_codes[c]).slice(0, 10);

    if (targetCodes.length === 0) {
      console.log("[AutoCoupon] 모든 최신 쿠폰이 이미 처리되었습니다.");
      await chrome.storage.local.set({ is_running: false });
      return { success: true, count: 0 };
    }

    console.log(`[AutoCoupon] ${targetCodes.length}개의 신규 쿠폰 일괄 등록 시작:`, targetCodes);

    // ⭐ 탭 1개만 백그라운드로 열어서 모든 쿠폰을 순서대로 등록 (창 수십 개 깜빡임 완전 방지!)
    let tab = null;
    let successCount = 0;

    try {
      tab = await chrome.tabs.create({ url: COUPON_URL, active: false });
      await waitForTabComplete(tab.id, 10000);

      for (const code of targetCodes) {
        const result = await executeInTab(tab.id, code);

        // 만료되었거나 존재하지 않는 쿠폰은 서버로 신고하여 즉시 영구 삭제!
        if (result.status === "EXPIRED" || result.status === "INVALID") {
          reportFailedCoupon(code, result.status);
        }

        if (result.status === "SUCCESS") {
          successCount++;
        } else if (result.status === "NEED_LOGIN") {
          sendToast("⚠️ 로그인 필요", "넥슨 웹 로그인이 필요합니다.");
          break; // 비로그인이면 중단
        }

        // 쿠폰 간 1초 대기
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      if (tab && tab.id) {
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
      }
    }

    await chrome.storage.local.set({ is_running: false });
    return { success: true, count: targetCodes.length, successCount };

  } catch (err) {
    console.error("[AutoCoupon] 쿠폰 수집/등록 중 오류 발생:", err);
    await chrome.storage.local.set({ is_running: false });
    return { success: false, error: err.message };
  }
}

// 5. 단일 쿠폰 등록 로직 (수동 입력 시)
async function applySingleCoupon(code) {
  const cleanCode = code.trim();
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: COUPON_URL, active: false });
    await waitForTabComplete(tab.id, 10000);

    const result = await executeInTab(tab.id, cleanCode);

    if (result.status === "EXPIRED" || result.status === "INVALID") {
      reportFailedCoupon(cleanCode, result.status);
    }

    return result;
  } catch (e) {
    return { status: "FAILED", message: e.message };
  } finally {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
    }
  }
}

// 탭 내에서 등록 실행 헬퍼
async function executeInTab(tabId, cleanCode) {
  console.log(`[AutoCoupon] 쿠폰 등록 실행: ${cleanCode}`);
  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: inPageRegister,
      args: [cleanCode]
    });

    const result = (injectionResults && injectionResults[0] && injectionResults[0].result) || {
      status: "FAILED",
      message: "결과 수신 실패"
    };

    await recordHistory(cleanCode, result.status, result.message);

    const { notify } = await chrome.storage.local.get("notify");
    if (notify !== false) {
      if (result.status === "SUCCESS") {
        sendToast("🎉 쿠폰 등록 성공!", `[${cleanCode}] 정상적으로 지급되었습니다.`);
      }
    }
    return result;
  } catch (e) {
    await recordHistory(cleanCode, "FAILED", e.message);
    return { status: "FAILED", message: e.message };
  }
}

// 실패/만료 쿠폰 서버 자동 신고 (다른 유저에게 전송 방지)
async function reportFailedCoupon(code, status) {
  try {
    await fetch("https://fc-coupon-api.alswnd0830.workers.dev/api/coupons/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, status })
    });
    console.log(`[AutoCoupon] 실패 쿠폰 서버 자동 제외 신고 완료: ${code} (${status})`);
  } catch (e) {
    console.error("[AutoCoupon] 서버 신고 전송 실패:", e);
  }
}

// 6. 탭 로드 완료 대기 헬퍼
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 7. fconline.nexon.com/coupon 페이지 내부에서 실행될 함수 (MAIN World에서 실행)
function inPageRegister(code) {
  return new Promise((resolve) => {
    let alertMsg = "";
    
    // 이전에 발생한 alert 메시지가 있다면 수집
    if (window.__fcAlerts && window.__fcAlerts.length > 0) {
      alertMsg = window.__fcAlerts[window.__fcAlerts.length - 1];
    }

    // 1. window.alert 가로채기 (팝업 없이 메시지만 저장하고 0초 만에 닫음)
    window.alert = function (msg) {
      alertMsg = String(msg);
      console.log("[AutoCoupon] Alert 가로채기 완료 (자동 닫힘):", msg);
    };

    // 2. window.confirm 가로채기 ('등록하시겠습니까?' 확인창 뜨면 자동으로 [확인=true] 클릭)
    window.confirm = function (msg) {
      alertMsg = String(msg);
      console.log("[AutoCoupon] Confirm 가로채기 완료 (자동 확인 클릭):", msg);
      return true;
    };

    // 3. window.prompt 가로채기
    window.prompt = function () {
      return "";
    };

    // 비로그인 상태 감지
    const bodyText = document.body ? document.body.innerText : "";
    if (bodyText.includes("로그인 후 이용") || alertMsg.includes("로그인")) {
      return resolve({ status: "NEED_LOGIN", message: "로그인 후 이용 가능합니다." });
    }

    // 입력창 찾기
    const input = document.querySelector("input[name='strCouponCode'], input#strCouponCode, input[type='text'], input:not([type])");
    if (!input) {
      if (alertMsg.includes("로그인")) {
        return resolve({ status: "NEED_LOGIN", message: alertMsg });
      }
      return resolve({ status: "FAILED", message: "쿠폰 입력창을 찾을 수 없습니다." });
    }

    // 쿠폰 코드 입력
    input.value = code;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // 4. 등록 버튼 찾기 및 다각도 클릭 트리거
    const buttons = Array.from(document.querySelectorAll("button, a, input[type='submit'], input[type='button'], input[type='image']"));
    const submitBtn = buttons.find(b => {
      const text = (b.innerText || b.value || b.getAttribute('title') || b.getAttribute('alt') || "").trim();
      const cls = b.className || "";
      const id = b.id || "";
      return text.includes("등록") || text === "확인" || cls.includes("submit") || cls.includes("btn_reg") || id.includes("submit") || id.includes("btnReg");
    });

    if (submitBtn) {
      submitBtn.click();
      submitBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (window.$ && typeof window.$(submitBtn).trigger === 'function') {
        window.$(submitBtn).trigger('click');
      }
      const onclickAttr = submitBtn.getAttribute("onclick");
      if (onclickAttr && !onclickAttr.startsWith("javascript:void") && !onclickAttr.startsWith("return false")) {
        try { new Function(onclickAttr).call(submitBtn); } catch (_) {}
      }
    } else {
      const form = input.closest("form");
      if (form) {
        if (typeof form.onsubmit === 'function') form.onsubmit();
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      }
    }

    // 5. 모달/레이어 팝업 감지, 텍스트 수집 후 자동 닫기 루프
    let waited = 0;
    const interval = setInterval(() => {
      waited += 200;

      // 1) HTML 레이어 팝업이나 모달이 떴다면 먼저 그 안의 텍스트(메시지)를 수집!
      const modalContainers = Array.from(document.querySelectorAll(
        ".popup, .modal, .layer, [class*='pop'], [class*='modal'], [class*='dialog'], [class*='alert']"
      )).filter(el => el.offsetParent !== null);

      for (const container of modalContainers) {
        const text = container.innerText.trim();
        if (
          text &&
          (text.includes("쿠폰") ||
            text.includes("지급") ||
            text.includes("실패") ||
            text.includes("완료") ||
            text.includes("3014") ||
            text.includes("만료") ||
            text.includes("사용한") ||
            text.includes("아닙니다"))
        ) {
          if (!alertMsg) {
            alertMsg = text;
            console.log("[AutoCoupon] HTML 모달 텍스트 감지 완료:", text);
          }
        }
      }

      // 2) 텍스트 수집 후 모달 내 [확인] / [닫기] 버튼 클릭하여 자동 닫기
      const modalBtns = Array.from(document.querySelectorAll(
        ".popup button, .popup a, .modal button, .layer button, .layer a, [class*='pop'] button, [class*='modal'] button, [class*='dialog'] button, button.btn_confirm, button.btn_ok, a.btn_confirm, a.btn_ok"
      )).filter(el => {
        const t = (el.innerText || el.value || "").trim();
        return (t === "확인" || t === "닫기" || t === "OK") && el !== submitBtn && el.offsetParent !== null;
      });

      if (modalBtns.length > 0) {
        modalBtns.forEach(btn => {
          try {
            console.log("[AutoCoupon] 모달 레이어 확인 버튼 자동 클릭!");
            btn.click();
          } catch (_) {}
        });
      }

      // 3) 결과 판정 (최대 4초 대기)
      if (alertMsg || waited >= 4000) {
        clearInterval(interval);

        // 아무런 메시지도 감지되지 않았다면 절대 성공이 아님! (가짜 성공 판정 원천 차단)
        if (!alertMsg) {
          return resolve({
            status: "FAILED",
            message: "응답 없음 (넥슨 서버에서 등록 결과를 받지 못했습니다)"
          });
        }

        const msg = alertMsg;
        let status = "FAILED";

        // 1) 성공 판정
        if (
          msg.includes("정상적으로") ||
          msg.includes("지급") ||
          msg.includes("완료되었습니다") ||
          msg.includes("보관함") ||
          msg.includes("수령")
        ) {
          status = "SUCCESS";
        }
        // 2) 이미 사용/등록된 쿠폰 판정 (실패 문구보다 먼저 검사해야 다른 유저용 쿠폰이 잘못 삭제되지 않음!)
        else if (
          msg.includes("이미 사용") ||
          msg.includes("이미 등록") ||
          msg.includes("사용한") ||
          msg.includes("이미 수령") ||
          msg.includes("1회만") ||
          msg.includes("중복")
        ) {
          status = "ALREADY_USED";
        }
        // 3) 로그인 필요
        else if (msg.includes("로그인")) {
          status = "NEED_LOGIN";
        }
        // 4) 만료된 쿠폰
        else if (msg.includes("만료") || msg.includes("유효기간")) {
          status = "EXPIRED";
        }
        // 5) 코드 불일치 / 무효 쿠폰
        else if (
          msg.includes("실패") ||
          msg.includes("아닙니다") ||
          msg.includes("3014") ||
          msg.includes("일치하지") ||
          msg.includes("존재하지") ||
          msg.includes("잘못된") ||
          msg.includes("확인해") ||
          msg.includes("오류")
        ) {
          status = "INVALID";
        } else {
          status = "UNKNOWN";
        }

        resolve({ status, message: msg });
      }
    }, 200);
  });
}

// 8. 기록 저장 헬퍼
async function recordHistory(code, status, message) {
  const { history = [], registered_codes = {} } = await chrome.storage.local.get(["history", "registered_codes"]);
  
  registered_codes[code] = {
    status,
    message,
    date: new Date().toISOString()
  };

  const newEntry = {
    code,
    status,
    message,
    time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  };

  const updatedHistory = [newEntry, ...history.slice(0, 29)]; // 최근 30개 유지

  await chrome.storage.local.set({
    registered_codes,
    history: updatedHistory
  });
}

// 9. 크롬 토스트 알림 발송 헬퍼
function sendToast(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message
    });
  } catch (e) {
    console.error("[AutoCoupon] 알림 발송 실패:", e);
  }
}
