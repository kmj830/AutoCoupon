import time
from typing import List
from .config import Config
from .storage import Storage
from .notifier import Notifier
from .nexon_client import NexonClient
from .providers.base import BaseCouponProvider
from .providers.inven_provider import InvenProvider
from .providers.server_provider import ServerProvider
from .providers.fmkorea_provider import FmKoreaProvider

class CouponScheduler:
    """주기적 크롤링 및 자동 등록 스케줄러"""

    def __init__(self, config: Config):
        self.config = config
        self.storage = Storage(config.db_path)
        self.notifier = Notifier(config.enable_notifications)
        self.client = NexonClient(config.user_data_dir, headless=config.headless)
        self.providers: List[BaseCouponProvider] = self._setup_providers()

    def _setup_providers(self) -> List[BaseCouponProvider]:
        providers = []
        # 서버 프로바이더 (설정에 server_url이 있거나 active_providers에 server가 있는 경우)
        if "server" in self.config.active_providers or self.config.server_url:
            providers.append(ServerProvider(self.config.server_url))

        # 인벤 크롤러 프로바이더
        if "inven" in self.config.active_providers:
            providers.append(InvenProvider())

        # 에펨코리아 크롤러 프로바이더
        if "fmkorea" in self.config.active_providers:
            providers.append(FmKoreaProvider())

        return providers

    def run_once(self):
        """1회 탐색 및 신규 쿠폰 자동 등록 실행"""
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] 쿠폰 수집 및 등록 주기 실행 시작...")
        total_discovered = 0
        new_coupons = []

        for provider in self.providers:
            try:
                print(f"[{provider.name}] 최신 쿠폰 조회 중...")
                coupons = provider.fetch_coupons()
                print(f"[{provider.name}] 조회 완료 ({len(coupons)}개 발견)")
                for code in coupons:
                    total_discovered += 1
                    if not self.storage.is_coupon_processed(code):
                        new_coupons.append((code, provider.name))
            except Exception as e:
                print(f"[{provider.name}] 수집 중 에러: {e}")

        if not new_coupons:
            print(">> 새로운 미등록 쿠폰이 없습니다. (다음 주기 대기)")
            return

        print(f"\n>> [신규 쿠폰 {len(new_coupons)}개 발견! 자동 등록 착수]")

        for code, source in new_coupons:
            # 넥슨 사이트에 등록 시도
            result = self.client.register_coupon(code)
            status = result.get("status", "UNKNOWN")
            message = result.get("message", "")

            # DB에 이력 저장 (중복 방지)
            self.storage.save_coupon(code, status=status, message=message, source=source)

            # 알림 발송
            if status == "SUCCESS":
                self.notifier.notify(
                    title="🎉 FC 온라인 쿠폰 자동 등록 성공!",
                    message=f"쿠폰: {code}\n결과: {message}",
                    status="SUCCESS"
                )
            elif status == "NEED_LOGIN":
                self.notifier.notify(
                    title="⚠️ 넥슨 로그인 세션 만료",
                    message="로그인이 필요합니다. 터미널에서 'python main.py login'을 실행해 주세요.",
                    status="FAILED"
                )
                print(">> [중단] 로그인이 만료되었으므로 추가 등록을 중단합니다.")
                break
            else:
                print(f">> [결과] {code} -> {status} ({message})")

            # 연속 요청 간 딜레이 (1~2초)
            time.sleep(2)

    def start(self):
        """주기적 백그라운드 모니터링 루프 시작"""
        print("\n=======================================================")
        print(f" [FC 온라인 쿠폰 24시간 자동 등록 시스템 가동]")
        print(f" - 확인 주기: {self.config.poll_interval_seconds}초")
        print(f" - 활성 소스: {[p.name for p in self.providers]}")
        print(f" - 세션 경로: {self.config.user_data_dir}")
        print(" (종료하려면 Ctrl + C를 누르세요)")
        print("=======================================================\n")

        # 최초 1회 즉시 실행
        self.run_once()

        while True:
            try:
                time.sleep(self.config.poll_interval_seconds)
                self.run_once()
            except KeyboardInterrupt:
                print("\n[알림] 사용자에 의해 모니터링이 안전하게 종료되었습니다.")
                break
            except Exception as e:
                print(f"[루프 오류]: {e}")
                time.sleep(10)
