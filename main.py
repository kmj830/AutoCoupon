import sys
import argparse
from src.config import load_config
from src.storage import Storage
from src.nexon_client import NexonClient
from src.scheduler import CouponScheduler

def cmd_login(args):
    config = load_config()
    client = NexonClient(config.user_data_dir, headless=False)
    client.interactive_login()

def cmd_status(args):
    config = load_config()
    storage = Storage(config.db_path)
    client = NexonClient(config.user_data_dir, headless=True)

    print("\n=======================================================")
    print(" [FC 온라인 자동 쿠폰 시스템 상태]")
    print("=======================================================")
    print(f" * 프로필 세션 경로: {config.user_data_dir}")
    print(f" * 확인 주기: {config.poll_interval_seconds}초")
    print(f" * 활성 소스: {config.active_providers}")
    if config.server_url:
        print(f" * 중앙 서버 URL: {config.server_url}")

    print("\n [1] 넥슨 로그인 상태 확인 중...")
    if client.is_logged_in():
        print("  -> ✅ 정상 로그인되어 있습니다! (세션 유효)")
    else:
        print("  -> ⚠️ 로그인 세션이 없습니다. 'python main.py login'을 실행해 주세요.")

    print("\n [2] 최근 쿠폰 등록 내역 (최대 10건)")
    history = storage.get_history(limit=10)
    if not history:
        print("  -> 등록 이력이 아직 없습니다.")
    else:
        for item in history:
            print(f"  [{item['status']}] {item['code']} (출처: {item['source']}, 시간: {item['applied_at']})")
            if item.get("message"):
                print(f"     ㄴ 메시지: {item['message']}")
    print("=======================================================\n")

def cmd_register(args):
    if not args.code:
        print("오류: 등록할 쿠폰 코드를 입력하세요. 예) python main.py register 쿠폰코드")
        return

    config = load_config()
    storage = Storage(config.db_path)
    client = NexonClient(config.user_data_dir, headless=config.headless)

    code = args.code.strip()
    result = client.register_coupon(code)
    status = result.get("status", "UNKNOWN")
    message = result.get("message", "")

    storage.save_coupon(code, status=status, message=message, source="manual")
    print(f"\n>> 결과: [{status}] {message}")

def cmd_run(args):
    config = load_config()
    scheduler = CouponScheduler(config)
    scheduler.start()

def cmd_once(args):
    config = load_config()
    scheduler = CouponScheduler(config)
    scheduler.run_once()

def main():
    parser = argparse.ArgumentParser(description="FC 온라인 쿠폰 자동 수집 & 무인 등록 시스템")
    subparsers = parser.add_subparsers(dest="command", help="사용 가능한 명령어")

    # login
    p_login = subparsers.add_parser("login", help="넥슨 계정 1회 로그인 (세션 영구 저장)")
    p_login.set_defaults(func=cmd_login)

    # run
    p_run = subparsers.add_parser("run", help="24시간 자동 쿠폰 감지 및 무인 등록 시작")
    p_run.set_defaults(func=cmd_run)

    # once
    p_once = subparsers.add_parser("once", help="1회만 즉시 새 쿠폰 확인 및 등록 후 자동 종료 (작업 스케줄러용)")
    p_once.set_defaults(func=cmd_once)

    # status
    p_status = subparsers.add_parser("status", help="로그인 상태 및 최근 쿠폰 등록 내역 조회")
    p_status.set_defaults(func=cmd_status)

    # register
    p_reg = subparsers.add_parser("register", help="특정 쿠폰 번호 1개 수동 등록")
    p_reg.add_argument("code", help="등록할 쿠폰 코드")
    p_reg.set_defaults(func=cmd_register)

    args = parser.parse_args()

    if not args.command:
        # 인자 없이 실행 시 도움말 및 기본 상태 출력
        print("\n[FC 온라인 자동 쿠폰 등록기]")
        print("사용법:")
        print("  python main.py login       -> 넥슨 1회 로그인 (최초 1회 필수)")
        print("  python main.py run         -> 24시간 자동 감지 및 등록 실행")
        print("  python main.py status      -> 현재 로그인 상태 및 등록 이력 확인")
        print("  python main.py register <코드> -> 특정 쿠폰 1개 수동 등록\n")
        cmd_status(args)
    else:
        args.func(args)

if __name__ == "__main__":
    main()
