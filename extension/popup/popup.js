// FC Online AutoCoupon - Popup Controller

document.addEventListener("DOMContentLoaded", async () => {
  const loginStatusEl = document.getElementById("loginStatus");
  const lastCheckTimeEl = document.getElementById("lastCheckTime");
  const toggleAutoCheck = document.getElementById("toggleAutoCheck");
  const toggleNotify = document.getElementById("toggleNotify");
  const btnRunNow = document.getElementById("btnRunNow");
  const manualCodeInput = document.getElementById("manualCode");
  const btnManualRegister = document.getElementById("btnManualRegister");
  const btnClearHistory = document.getElementById("btnClearHistory");
  const historyListEl = document.getElementById("historyList");

  // 1. 저장된 설정 불러오기
  const state = await chrome.storage.local.get([
    "auto_check",
    "notify",
    "last_check_time",
    "is_running",
    "history"
  ]);

  toggleAutoCheck.checked = state.auto_check !== false;
  toggleNotify.checked = state.notify !== false;
  lastCheckTimeEl.textContent = state.last_check_time || "아직 없음";

  renderHistory(state.history || []);

  // 2. 넥슨 로그인 상태 확인
  checkLoginStatus();

  // 3. 토글 이벤트 리스너
  toggleAutoCheck.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ auto_check: e.target.checked });
  });

  toggleNotify.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ notify: e.target.checked });
  });

  // 4. 지금 즉시 실행 버튼
  btnRunNow.addEventListener("click", async () => {
    btnRunNow.disabled = true;
    btnRunNow.innerHTML = `<span class="btn-icon">⏳</span> 확인 및 등록 중...`;

    try {
      const response = await chrome.runtime.sendMessage({ action: "RUN_NOW" });
      const newState = await chrome.storage.local.get(["last_check_time", "history"]);
      lastCheckTimeEl.textContent = newState.last_check_time || "방금";
      renderHistory(newState.history || []);

      if (response && response.count !== undefined) {
        alert(`신규 쿠폰 탐색 완료!\n대상 쿠폰: ${response.count}개\n등록 성공: ${response.successCount || 0}개`);
      }
    } catch (e) {
      alert("실행 오류: " + e.message);
    } finally {
      btnRunNow.disabled = false;
      btnRunNow.innerHTML = `<span class="btn-icon">⚡</span> 지금 즉시 쿠폰 확인 및 등록`;
      checkLoginStatus();
    }
  });

  // 5. 수동 쿠폰 등록
  btnManualRegister.addEventListener("click", async () => {
    const code = manualCodeInput.value.trim();
    if (!code) {
      alert("등록할 쿠폰 코드를 입력하세요.");
      return;
    }

    btnManualRegister.disabled = true;
    btnManualRegister.textContent = "등록 중...";

    try {
      const res = await chrome.runtime.sendMessage({ action: "REGISTER_CODE", code });
      manualCodeInput.value = "";
      const newState = await chrome.storage.local.get(["history"]);
      renderHistory(newState.history || []);

      alert(`[${code}] 등록 결과:\n${res.status} (${res.message})`);
    } catch (e) {
      alert("등록 오류: " + e.message);
    } finally {
      btnManualRegister.disabled = false;
      btnManualRegister.textContent = "등록";
      checkLoginStatus();
    }
  });

  // 6. 기록 비우기
  btnClearHistory.addEventListener("click", async () => {
    if (confirm("등록 이력을 비우시겠습니까?")) {
      await chrome.storage.local.set({ history: [] });
      renderHistory([]);
    }
  });

  // 로그인 상태 확인 함수
  async function checkLoginStatus() {
    try {
      const cookies = await chrome.cookies.getAll({ domain: "nexon.com" });
      const names = cookies.map(c => c.name);
      const isLoggedIn = names.includes("NEXON") || names.includes("NPP") || names.includes("ENC");

      if (isLoggedIn) {
        loginStatusEl.textContent = "✅ 로그인 됨 (정상)";
        loginStatusEl.className = "value logged-in";
      } else {
        loginStatusEl.textContent = "⚠️ 로그인 필요 (홈페이지 접속)";
        loginStatusEl.className = "value logged-out";
      }
    } catch (e) {
      loginStatusEl.textContent = "확인 불가";
      loginStatusEl.className = "value muted";
    }
  }

  // 내역 렌더링 함수
  function renderHistory(items) {
    if (!items || items.length === 0) {
      historyListEl.innerHTML = `<div class="empty-text">등록 내역이 없습니다.</div>`;
      return;
    }

    historyListEl.innerHTML = items.map(item => {
      let tagClass = "tag-failed";
      let tagText = item.status || "실패";

      if (item.status === "SUCCESS") {
        tagClass = "tag-success";
        tagText = "성공";
      } else if (item.status === "ALREADY_USED") {
        tagClass = "tag-used";
        tagText = "이미사용";
      } else if (item.status === "EXPIRED") {
        tagClass = "tag-used";
        tagText = "만료";
      } else if (item.status === "NEED_LOGIN") {
        tagClass = "tag-failed";
        tagText = "로그인필요";
      }

      return `
        <div class="history-item">
          <div class="item-left">
            <span class="item-code">${escapeHtml(item.code)}</span>
            <span class="item-time">${escapeHtml(item.time || "")} - ${escapeHtml(item.message || "")}</span>
          </div>
          <span class="status-tag ${tagClass}">${tagText}</span>
        </div>
      `;
    }).join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
