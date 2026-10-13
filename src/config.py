import json
import os
from dataclasses import dataclass, field
from typing import List

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")

@dataclass
class Config:
    poll_interval_seconds: int = 180
    active_providers: List[str] = field(default_factory=lambda: ["inven", "arcalive"])
    server_url: str = ""
    discord_webhook_url: str = ""
    headless: bool = True
    user_data_dir: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "browser_profile")
    db_path: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "coupons.db")

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
            poll_interval_seconds=data.get("poll_interval_seconds", 180),
            active_providers=data.get("active_providers", ["inven", "arcalive"]),
            server_url=data.get("server_url", ""),
            discord_webhook_url=data.get("discord_webhook_url", ""),
            headless=data.get("headless", True),
            user_data_dir=data.get("user_data_dir", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "browser_profile")),
            db_path=data.get("db_path", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "coupons.db"))
        )
    except Exception as e:
        print(f"[설정] config.json 로드 실패, 기본값 사용: {e}")
        return Config()

def save_config(cfg: Config):
    data = {
        "poll_interval_seconds": cfg.poll_interval_seconds,
        "active_providers": cfg.active_providers,
        "server_url": cfg.server_url,
        "discord_webhook_url": cfg.discord_webhook_url,
        "headless": cfg.headless,
        "user_data_dir": cfg.user_data_dir,
        "db_path": cfg.db_path
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
