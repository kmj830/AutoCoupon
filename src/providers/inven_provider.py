import re
import urllib.parse
from typing import List, Set
import httpx
from bs4 import BeautifulSoup

from .base import BaseCouponProvider

class InvenProvider(BaseCouponProvider):
    """FC 온라인 인벤 팁과 노하우(쿠폰 탭) 실시간 크롤러"""

    BOARD_URL = "https://www.inven.co.kr/board/fifaonline4/3145"

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }

    @property
    def name(self) -> str:
        return "inven"

    def fetch_coupons(self) -> List[str]:
        coupons: Set[str] = set()
        cat = urllib.parse.quote("쿠폰")
        url = f"{self.BOARD_URL}?category={cat}"

        try:
            with httpx.Client(timeout=10.0, headers=self.headers, follow_redirects=True) as client:
                res = client.get(url)
                if res.status_code != 200:
                    print(f"[{self.name}] 인벤 접속 실패 (HTTP {res.status_code})")
                    return []

                soup = BeautifulSoup(res.text, "html.parser")
                links = soup.select("td.tit a.subject-link")
                
                # 상위 15개 게시물 확인
                for link in links[:15]:
                    title = link.text.strip()
                    post_url = link.get("href")

                    # 공지글/안내글 제외
                    if any(k in title for k in ["안내드립니다", "공지", "영상", "규정"]):
                        continue

                    # 제목에서 쿠폰 추출
                    extracted = self._extract_from_text(title)
                    for c in extracted:
                        coupons.add(c)

                    # 제목이 요약형이거나 본문에 쿠폰이 있을 법한 경우 본문도 조회
                    if any(k in title for k in ["개", "모음", "총", "쿠폰"]) and post_url:
                        try:
                            post_res = client.get(post_url)
                            if post_res.status_code == 200:
                                post_soup = BeautifulSoup(post_res.text, "html.parser")
                                content_elem = post_soup.select_one("#powerbbsContent")
                                if content_elem:
                                    body_text = content_elem.text.strip()
                                    body_extracted = self._extract_from_text(body_text)
                                    for c in body_extracted:
                                        coupons.add(c)
                        except Exception:
                            pass

        except Exception as e:
            print(f"[{self.name}] 크롤링 중 오류 발생: {e}")

        return list(coupons)

    def _extract_from_text(self, text: str) -> List[str]:
        """텍스트에서 쿠폰 코드 패턴을 추출하고 정제"""
        results = []
        # [카테고리] 태그 제거
        clean_text = re.sub(r"\[.*?\]", "", text)
        
        # 줄바꿈 및 구분자로 분리
        lines = re.split(r"[\n/,|]", clean_text)
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # URL이나 웹사이트 링크가 포함된 줄 제외
            if any(url_word in line.lower() for url_word in ["http", "https", ".com", ".kr", ".net"]):
                continue

            # '쿠폰:', '코드:', 'K리그 :' 등 라벨 접두어 제거
            line = re.sub(r"^(쿠폰\s*[:\-]|\s*코드\s*[:\-]|\s*K리그\s*[:\-]|\s*쿠폰번호\s*[:\-])", "", line).strip()
            
            # 유효 문자(한글, 영문, 숫자)만 추출
            code = re.sub(r"[^가-힣a-zA-Z0-9]", "", line)
            
            # FC 온라인 쿠폰은 보통 4자 이상 30자 이하
            if 4 <= len(code) <= 30:
                # 일반 대화체 어미나 노이즈 필터링
                noise = ["안내드립니다", "감사합니다", "댓글", "추천", "쿠폰모음", "제목과같", "수정완료", "경품까지"]
                if any(n in code for n in noise):
                    continue
                
                # 단순히 'OO쿠폰' 형태의 제목 설명문 제외 (쿠폰 코드가 아닌 경우)
                if code.endswith("쿠폰") and len(code) <= 8 and not any(char.isdigit() for char in code):
                    continue

                results.append(code)

        return results
