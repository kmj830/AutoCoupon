import os
import time
from typing import Dict, Any, Optional
from playwright.sync_api import sync_playwright, BrowserContext, Page, Dialog

class NexonClient:
    """넥슨 FC 온라인 로그인 세션 관리 및 쿠폰 자동 등록 엔진"""

    LOGIN_URL = "https://nid.nexon.com/web/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex"
    MAIN_URL = "https://fconline.nexon.com/main/index"
    COUPON_URL = "https://fconline.nexon.com/coupon"

    def __init__(self, user_data_dir: str, headless: bool = True):
        self.user_data_dir = os.path.abspath(user_data_dir)
        self.headless = headless
        os.makedirs(self.user_data_dir, exist_ok=True)

    def _launch_context(self, p, headless: bool):
        """Chrome -> Edge -> ms-playwright 순서로 브라우저 실행"""
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright"))
        args = ["--disable-blink-features=AutomationControlled"]
        if not headless:
            args.append("--window-size=1280,800")

        for channel in ["chrome", "msedge", None]:
            try:
                kwargs = {
                    "user_data_dir": self.user_data_dir,
                    "headless": headless,
                    "args": args
                }
                if channel:
                    kwargs["channel"] = channel
                return p.chromium.launch_persistent_context(**kwargs)
            except Exception:
                continue
        raise RuntimeError("크롬 또는 엣지 브라우저를 실행할 수 없습니다.")

    def interactive_login(self, timeout_seconds: int = 300) -> bool:
        """최초 1회 사용자가 직접 브라우저에서 로그인할 수 있도록 창을 띄우고 세션을 저장"""
        print("\n=======================================================")
        print(" [넥슨 1회 로그인 시작] 브라우저 창이 열립니다.")
        print(" 1. 넥슨 계정으로 로그인(OTP 인증 포함)을 진행해 주세요.")
        print(" 2. '로그인 상태 유지' 체크를 권장합니다.")
        print(" 3. 로그인이 완료되면 자동으로 세션이 저장되고 창이 닫힙니다.")
        print("=======================================================\n")

        with sync_playwright() as p:
            context = self._launch_context(p, headless=False)

            page = context.pages[0] if context.pages else context.new_page()
            page.goto(self.LOGIN_URL, wait_until="domcontentloaded")

            start_time = time.time()
            logged_in = False

            while time.time() - start_time < timeout_seconds:
                try:
                    # FC 온라인 메인 페이지 또는 로그인 상태 확인
                    is_signed_in = page.evaluate("""() => {
                        return (window.inface && window.inface.auth && typeof window.inface.auth.isSignedIn === 'function') 
                            ? window.inface.auth.isSignedIn() 
                            : false;
                    }""")

                    if is_signed_in:
                        logged_in = True
                        break
                    
                    # 넥슨 쿠키 확인 (NEXON 쿠키가 발급되었는지)
                    cookies = context.cookies("https://nexon.com")
                    cookie_names = [c["name"] for c in cookies]
                    if "NEXON" in cookie_names or "NPP" in cookie_names:
                        # 메인으로 이동해서 최종 동기화
                        if "nid.nexon.com" in page.url:
                            page.goto(self.MAIN_URL, wait_until="networkidle")
                            time.sleep(2)
                            logged_in = True
                            break

                except Exception:
                    pass

                time.sleep(2)

            if logged_in:
                print(">> [성공] 넥슨 로그인 및 세션 저장이 완료되었습니다!")
                time.sleep(2)
                context.close()
                return True
            else:
                print(">> [시간 초과] 로그인 제한 시간(5분)이 지났습니다.")
                context.close()
                return False

    def is_logged_in(self) -> bool:
        """저장된 세션 프로필로 현재 로그인이 유효한지 확인"""
        with sync_playwright() as p:
            try:
                context = self._launch_context(p, headless=True)
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(self.MAIN_URL, wait_until="networkidle", timeout=15000)

                is_signed_in = page.evaluate("""() => {
                    return (window.inface && window.inface.auth && typeof window.inface.auth.isSignedIn === 'function') 
                        ? window.inface.auth.isSignedIn() 
                        : false;
                }""")
                context.close()
                return bool(is_signed_in)
            except Exception as e:
                print(f"[세션 점검 오류]: {e}")
                return False

    def register_coupon(self, coupon_code: str) -> Dict[str, Any]:
        """지정된 쿠폰 코드를 FC 온라인 쿠폰 페이지에 등록"""
        clean_code = coupon_code.strip()
        print(f"\n[쿠폰 등록 시도] 코드: '{clean_code}'")

        dialog_message = ""
        dialog_received = False

        def handle_dialog(dialog: Dialog):
            nonlocal dialog_message, dialog_received
            dialog_message = dialog.message
            dialog_received = True
            print(f">> [다이얼로그 수신]: {dialog.message}")
            try:
                dialog.accept()
            except Exception:
                pass

        with sync_playwright() as p:
            try:
                context = self._launch_context(p, headless=self.headless)
                page = context.pages[0] if context.pages else context.new_page()
                page.on("dialog", handle_dialog)

                # 쿠폰 페이지 이동
                response = page.goto(self.COUPON_URL, wait_until="networkidle", timeout=20000)
                time.sleep(1)

                # 비로그인 체크 (다이얼로그에 '로그인 후 이용 가능' 떴는지)
                if dialog_received and "로그인" in dialog_message:
                    context.close()
                    return {
                        "status": "NEED_LOGIN",
                        "message": "로그인 세션이 만료되었습니다. 'python main.py login'으로 재로그인해 주세요."
                    }

                # 입력창 찾기
                input_selector = (
                    "input[name='strCouponCode'], "
                    "input#strCouponCode, "
                    "input[type='text'], "
                    "input:not([type])"
                )
                input_elem = page.locator(input_selector).first

                if not input_elem.is_visible(timeout=5000):
                    # 만약 로그인 체크 알림이 떴다면
                    if "로그인" in dialog_message:
                        context.close()
                        return {"status": "NEED_LOGIN", "message": "로그인이 필요합니다."}
                    context.close()
                    return {"status": "FAILED", "message": "쿠폰 입력창을 찾을 수 없습니다."}

                # 쿠폰 번호 입력
                input_elem.fill(clean_code)
                time.sleep(0.5)

                # 등록 버튼 클릭
                submit_selector = (
                    "button:has-text('등록'), "
                    "button:has-text('확인'), "
                    "a:has-text('등록'), "
                    "a:has-text('확인'), "
                    "input[type='submit'], "
                    "input[value*='등록']"
                )
                submit_btn = page.locator(submit_selector).first

                if submit_btn.is_visible(timeout=3000):
                    submit_btn.click()
                else:
                    # 엔터키 입력 시도
                    input_elem.press("Enter")

                # 결과 다이얼로그 또는 DOM 응답 대기 (최대 5초)
                start_wait = time.time()
                while not dialog_received and (time.time() - start_wait < 5):
                    page.wait_for_timeout(500)

                context.close()

                # 결과 판정
                msg = dialog_message.strip()
                if not msg:
                    msg = "응답 다이얼로그 없음 (등록 완료되었거나 DOM 팝업 형태일 수 있음)"

                if any(k in msg for k in ["정상적으로", "지급되었습니다", "완료되었습니다", "성공"]):
                    return {"status": "SUCCESS", "message": msg}
                elif any(k in msg for k in ["이미 사용", "이미 등록", "사용한"]):
                    return {"status": "ALREADY_USED", "message": msg}
                elif any(k in msg for k in ["만료", "유효기간"]):
                    return {"status": "EXPIRED", "message": msg}
                elif any(k in msg for k in ["일치하지", "존재하지", "확인해", "잘못된"]):
                    return {"status": "INVALID", "message": msg}
                elif any(k in msg for k in ["로그인"]):
                    return {"status": "NEED_LOGIN", "message": msg}
                else:
                    return {"status": "SUCCESS" if dialog_received else "UNKNOWN", "message": msg}

            except Exception as e:
                return {"status": "FAILED", "message": f"실행 중 예외 발생: {str(e)}"}
