import sqlite3
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

class Storage:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS coupons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT,
                    source TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    applied_at TIMESTAMP
                );
            """)
            conn.commit()

    def is_coupon_processed(self, code: str) -> bool:
        normalized_code = code.strip().upper()
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT 1 FROM coupons WHERE code = ?", (normalized_code,))
            return cursor.fetchone() is not None

    def save_coupon(self, code: str, status: str, message: str = "", source: str = "manual"):
        normalized_code = code.strip().upper()
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO coupons (code, status, message, source, applied_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    status=excluded.status,
                    message=excluded.message,
                    applied_at=excluded.applied_at;
            """, (normalized_code, status, message, source, now))
            conn.commit()

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT id, code, status, message, source, created_at, applied_at
                FROM coupons
                ORDER BY id DESC
                LIMIT ?;
            """, (limit,))
            return [dict(row) for row in cursor.fetchall()]
