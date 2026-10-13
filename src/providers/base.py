from abc import ABC, abstractmethod
from typing import List

class BaseCouponProvider(ABC):
    """모든 쿠폰 공급자(크롤러, 서버 API 등)의 기본 인터페이스"""

    @property
    @abstractmethod
    def name(self) -> str:
        """공급자 식별 이름"""
        pass

    @abstractmethod
    def fetch_coupons(self) -> List[str]:
        """최신 쿠폰 코드 목록을 반환하는 메서드"""
        pass
