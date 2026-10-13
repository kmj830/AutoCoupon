from typing import List
import httpx
from .base import BaseCouponProvider

class ServerProvider(BaseCouponProvider):
    """중앙 백엔드 서버(Cloudflare Workers 또는 REST API)에서 쿠폰 수신"""

    def __init__(self, server_url: str):
        self.server_url = server_url.strip()
        self.headers = {
            "User-Agent": "AutoCoupon-Client/1.0"
        }

    @property
    def name(self) -> str:
        return "server"

    def fetch_coupons(self) -> List[str]:
        if not self.server_url:
            return []

        try:
            with httpx.Client(timeout=10.0, headers=self.headers) as client:
                res = client.get(self.server_url)
                if res.status_code != 200:
                    print(f"[{self.name}] 서버 응답 오류 (HTTP {res.status_code})")
                    return []

                data = res.json()
                codes: List[str] = []

                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, str):
                            codes.append(item.strip())
                        elif isinstance(item, dict) and "code" in item:
                            codes.append(str(item["code"]).strip())
                elif isinstance(data, dict):
                    # {"coupons": [...]} or {"data": [...]}
                    raw_list = data.get("coupons") or data.get("data") or data.get("items") or []
                    for item in raw_list:
                        if isinstance(item, str):
                            codes.append(item.strip())
                        elif isinstance(item, dict) and "code" in item:
                            codes.append(str(item["code"]).strip())

                return [c for c in codes if c]
        except Exception as e:
            print(f"[{self.name}] 서버 쿠폰 조회 실패 ({self.server_url}): {e}")
            return []
