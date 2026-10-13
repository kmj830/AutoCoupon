import re
from typing import List, Set
import httpx
from bs4 import BeautifulSoup
from .base import BaseCouponProvider

class FmKoreaProvider(BaseCouponProvider):
    """에펨코리아 FC 온라인 게시판(쿠폰 탭) 실시간 크롤러"""

    BOARD_URL = "https://www.fmkorea.com/index.php?mid=fifa_online&category=5746170222"

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }

    @property
    def name(self) -> str:
        return "fmkorea"

    def fetch_coupons(self) -> List[str]:
        coupons: Set[str] = set()

        try:
            with httpx.Client(timeout=10.0, headers=self.headers, follow_redirects=True) as client:
                res = client.get(self.BOARD_URL)
                if res.status_code != 200:
                    print(f"[{self.name}] 에펨코리아 접속 실패 (HTTP {res.status_code})")
                    return []

                soup = BeautifulSoup(res.text, "html.parser")
                rows = soup.select("tbody tr:not(.notice)")

                # 상위 10개 일반 게시글 확인
                for row in rows[:10]:
                    title_elem = row.select_one("td.title a.hx, td.title a:first-child")
                    if not title_elem:
                        continue

                    title = title_elem.text.strip()
                    post_href = title_elem.get("href")

                    # 공지 또는 안내글 제외
                    if any(k in title for k in ["공지", "팁글모음", "안내"]):
                        continue

                    # 1. 제목에서 쿠폰 코드 추출
                    extracted = self._extract_from_text(title)
                    for c in extracted:
                        coupons.add(c)

                    # 2. 제목이 요약형이거나 본문에 쿠폰이 있을 법한 경우 본문도 크롤링
                    if post_href and any(k in title for k in ["쿠폰", "차", "개", "모음", "CHAMPIONS", "CUP"]):
                        post_url = f"https://www.fmkorea.com{post_href}" if post_href.startswith("/") else post_href
                        try:
                            post_res = client.get(post_url)
                            if post_res.status_code == 200:
                                post_soup = BeautifulSoup(post_res.text, "html.parser")
                                content_elem = post_soup.select_one("article, .rd_body")
                                if content_elem:
                                    body_text = content_elem.get_text(separator="\n")
                                    body_extracted = self._extract_from_text(body_text)
                                    for c in body_extracted:
                                        coupons.add(c)
                        except Exception:
                            pass

        except Exception as e:
            print(f"[{self.name}] 크롤링 중 오류: {e}")

        return list(coupons)

    def _extract_from_text(self, text: str) -> List[str]:
        results = []
        for raw_line in text.split("\n"):
            line = raw_line.strip()
            if not line:
                continue

            # 링크 및 안내문 제외
            if any(k in line for k in ["http", "fmkorea.com", "복사", "퍼가기", "금지"]):
                continue

            # '1차쿠폰:', '2차 쿠폰', 'FC PRO 쿠폰', '코드:' 등 접두사 정밀 제거
            line = re.sub(
                r"^(?:\d+차\s*(?:쿠폰)?|FC\s*PRO\s*(?:쿠폰)?|쿠폰\s*코드|쿠폰|코드|K리그)\s*[:\-]?\s*",
                "",
                line,
                flags=re.IGNORECASE
            ).strip()

            # 영숫자 + 한글만 추출
            code = re.sub(r"[^가-힣a-zA-Z0-9]", "", line)

            if 4 <= len(code) <= 30:
                noise = ["안내드립니다", "감사합니다", "댓글", "추천", "공지사항", "이상한데", "3개", "CHAMPIONS"]
                if any(n in code for n in noise):
                    continue
                if code.endswith("쿠폰") and len(code) <= 8 and not any(c.isdigit() for c in code):
                    continue
                results.append(code)

        return results
