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

    // 아직 등록 시도하지 않은 새 쿠폰만 필터링
    const targetCodes = codes.filter(c => !registered_codes[c]);

    if (targetCodes.length === 0) {
      console.log("[AutoCoupon] 모든 최신 쿠폰이 이미 처리되었습니다.");
      await chrome.storage.local.set({ is_running: false });
      return { success: true, count: 0 };
    }

    console.log(`[AutoCoupon] ${targetCodes.length}개의 신규 쿠폰을 등록합니다:`, targetCodes);

    let successCount = 0;
    for (const code of targetCodes) {
      const result = await applySingleCoupon(code);
      if (result.status === "SUCCESS") successCount++;
      if (result.status === "NEED_LOGIN") {
        sendToast("로그인 필요", "넥슨 웹 로그인이 필요합니다. 홈페이지에서 로그인해 주세요.");
        break; // 로그인 풀렸으면 중단
      }
      // 짧은 대기 시간
      await new Promise(r => setTimeout(r, 1000));
    }

    await chrome.storage.local.set({ is_running: false });
    return { success: true, count: targetCodes.length, successCount };

  } catch (err) {
    console.error("[AutoCoupon] 쿠폰 수집/등록 중 오류 발생:", err);
    await chrome.storage.local.set({ is_running: false });
    return { success: false, error: err.message };
  }
}

// 5. 단일 쿠폰 등록 로직 (백그라운드 탭 활용)
async function applySingleCoupon(code) {
  const cleanCode = code.trim();
  console.log(`[AutoCoupon] 쿠폰 등록 시도: ${cleanCode}`);

  let tab = null;
  try {
    // 사용자를 방해하지 않는 백그라운드 탭 생성 (active: false)
    tab = await chrome.tabs.create({ url: COUPON_URL, active: false });

    // 탭 로딩 완료 대기
    await waitForTabComplete(tab.id, 10000);

    // 페이지 내 등록 스크립트 주입 및 실행 (world: MAIN을 지정하여 웹페이지와 동일한 컨텍스트에서 실행)
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: inPageRegister,
      args: [cleanCode]
    });

    const result = (injectionResults && injectionResults[0] && injectionResults[0].result) || {
      status: "FAILED",
      message: "결과 수신 실패"
    };

    // 기록 저장
    await recordHistory(cleanCode, result.status, result.message);

    // 알림 발송
    const { notify } = await chrome.storage.local.get("notify");
    if (notify !== false) {
      if (result.status === "SUCCESS") {
        sendToast("🎉 쿠폰 등록 성공!", `[${cleanCode}] 정상적으로 지급되었습니다.`);
      } else if (result.status === "ALREADY_USED") {
        // 이미 사용한 쿠폰은 무음 처리하거나 가벼운 알림
      } else if (result.status === "NEED_LOGIN") {
        sendToast("⚠️ 로그인 필요", "넥슨 로그인이 필요합니다.");
      }
    }

    return result;

  } catch (e) {
    console.error(`[AutoCoupon] ${cleanCode} 등록 중 예외:`, e);
    await recordHistory(cleanCode, "FAILED", e.message);
    return { status: "FAILED", message: e.message };
  } finally {
    // 탭 닫기
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (_) {}
    }
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

    // 등록 버튼 찾기 및 클릭
    const buttons = Array.from(document.querySelectorAll("button, a, input[type='submit'], input[type='button']"));
    const submitBtn = buttons.find(b => {
      const text = (b.innerText || b.value || "").trim();
      return text.includes("등록") || text === "확인";
    });

    if (submitBtn) {
      submitBtn.click();
    } else {
      const form = input.closest("form");
      if (form) form.submit();
      else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    }

    // 4. 모달/레이어 팝업의 [확인] 버튼 및 alert 메시지 자동 감지 루프
    let waited = 0;
    const interval = setInterval(() => {
      waited += 200;

      // HTML 레이어 팝업 / 모달 내에 [확인] / [닫기] 버튼이 뜨면 자동으로 클릭!
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

      if (alertMsg || waited >= 3000) {
        clearInterval(interval);
        const msg = alertMsg || "등록 완료";
        let status = "SUCCESS";
        if (msg.includes("이미 사용") || msg.includes("이미 등록") || msg.includes("사용한")) {
          status = "ALREADY_USED";
        } else if (msg.includes("만료") || msg.includes("유효기간")) {
          status = "EXPIRED";
        } else if (msg.includes("일치하지") || msg.includes("존재하지") || msg.includes("잘못된") || msg.includes("확인해")) {
          status = "INVALID";
        } else if (msg.includes("로그인")) {
          status = "NEED_LOGIN";
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
