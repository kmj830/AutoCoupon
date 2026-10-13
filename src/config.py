import os
import sys
import json
from dataclasses import dataclass, field
from typing import List

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

@dataclass
class Config:
    poll_interval_seconds: int = 300  # 5분
    enable_notifications: bool = True  # 윈도우 팝업 알림 ON/OFF
    active_providers: List[str] = field(default_factory=lambda: ["server", "inven", "fmkorea"])
    server_url: str = "https://fc-coupon-api.alswnd0830.workers.dev/api/coupons"
    headless: bool = True
    user_data_dir: str = os.path.join(BASE_DIR, "data", "browser_profile")
    db_path: str = os.path.join(BASE_DIR, "data", "coupons.db")

def load_config() -> Config:
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        cfg = Config()
        save_config(cfg)
        return cfg

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Config(
            poll_interval_seconds=data.get("poll_interval_seconds", 300),
            enable_notifications=data.get("enable_notifications", True),
            active_providers=data.get("active_providers", ["server", "inven", "fmkorea"]),
            server_url=data.get("server_url", "https://fc-coupon-api.alswnd0830.workers.dev/api/coupons"),
            headless=data.get("headless", True),
            user_data_dir=os.path.join(BASE_DIR, "data", "browser_profile"),
            db_path=os.path.join(BASE_DIR, "data", "coupons.db")
        )
    except Exception as e:
        print(f"[설정] config.json 로드 실패, 기본값 사용: {e}")
        return Config()

def save_config(cfg: Config):
    data = {
        "poll_interval_seconds": cfg.poll_interval_seconds,
        "enable_notifications": cfg.enable_notifications,
        "active_providers": cfg.active_providers,
        "server_url": cfg.server_url,
        "headless": cfg.headless,
        "user_data_dir": "./data/browser_profile",
        "db_path": "./data/coupons.db"
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
