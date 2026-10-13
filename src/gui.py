import os
import sys
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, messagebox

from .config import Config, load_config, save_config
from .storage import Storage
from .nexon_client import NexonClient
from .scheduler import CouponScheduler
from .notifier import Notifier

TASK_NAME = "FCOnlineAutoCoupon"

class AutoCouponGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("⚽ FC 온라인 쿠폰 자동 등록기 (AutoCoupon)")
        self.root.geometry("640 x 700".replace(" ", ""))
        self.root.resizable(False, False)

        # 시스템 기본 폰트 및 스타일
        self.config = load_config()
        self.storage = Storage(self.config.db_path)
        self.client = NexonClient(self.config.user_data_dir, headless=self.config.headless)

        self._apply_styles()
        self._build_ui()
        self._check_login_status_async()
        self._check_scheduler_status()
        self._refresh_history()

    def _apply_styles(self):
        style = ttk.Style()
        style.theme_use("clam")

        self.root.configure(bg="#f1f5f9")
        style.configure("TLabel", background="#f1f5f9", font=("맑은 고딕", 9))
        style.configure("Header.TLabel", background="#f1f5f9", font=("맑은 고딕", 13, "bold"), foreground="#0f172a")
        style.configure("Card.TFrame", background="#ffffff", relief="flat")
        style.configure("CardTitle.TLabel", background="#ffffff", font=("맑은 고딕", 10, "bold"), foreground="#0284c7")
        style.configure("CardText.TLabel", background="#ffffff", font=("맑은 고딕", 9), foreground="#334155")

        # 버튼 스타일
        style.configure("Primary.TButton", font=("맑은 고딕", 9, "bold"), foreground="#ffffff", background="#0284c7")
        style.map("Primary.TButton", background=[("active", "#0369a1")])

        style.configure("Success.TButton", font=("맑은 고딕", 9, "bold"), foreground="#ffffff", background="#10b981")
        style.map("Success.TButton", background=[("active", "#059669")])

        style.configure("Danger.TButton", font=("맑은 고딕", 9), foreground="#ffffff", background="#ef4444")
        style.map("Danger.TButton", background=[("active", "#dc2626")])

    def _build_ui(self):
        main_frame = ttk.Frame(self.root, padding=16)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 헤더
        header = ttk.Label(main_frame, text="⚽ FC 온라인 쿠폰 24시간 무인 자동 등록기", style="Header.TLabel")
        header.pack(anchor="w", pady=(0, 12))

        # 1. 넥슨 계정 연동 카드
        self._build_account_card(main_frame)

        # 2. 알림 설정 카드 (윈도우 팝업)
        self._build_notification_card(main_frame)

        # 3. 5분 백그라운드 자동화 카드
        self._build_automation_card(main_frame)

        # 4. 최근 등록 내역 카드
        self._build_history_card(main_frame)

        # 하단 액션 버튼
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill=tk.X, pady=(12, 0))

        save_btn = ttk.Button(btn_frame, text="💾 설정 저장", style="Primary.TButton", command=self._save_settings)
        save_btn.pack(side=tk.RIGHT, padx=(6, 0))

        close_btn = ttk.Button(btn_frame, text="닫기", command=self.root.destroy)
        close_btn.pack(side=tk.RIGHT)

    def _build_account_card(self, parent):
        card = tk.LabelFrame(parent, text=" 넥슨 계정 연동 ", font=("맑은 고딕", 10, "bold"), bg="#ffffff", fg="#0284c7", padx=12, pady=10)
        card.pack(fill=tk.X, pady=(0, 10))

        status_frame = tk.Frame(card, bg="#ffffff")
        status_frame.pack(fill=tk.X)

        tk.Label(status_frame, text="로그인 상태: ", font=("맑은 고딕", 9, "bold"), bg="#ffffff").pack(side=tk.LEFT)
        self.login_status_label = tk.Label(status_frame, text="확인 중...", font=("맑은 고딕", 9), bg="#ffffff", fg="#64748b")
        self.login_status_label.pack(side=tk.LEFT)

        login_btn = ttk.Button(card, text="🔑 넥슨 계정 1회 로그인 (브라우저 열기)", style="Primary.TButton", command=self._on_login_click)
        login_btn.pack(anchor="w", pady=(8, 0))

    def _build_notification_card(self, parent):
        card = tk.LabelFrame(parent, text=" 알림 설정 ", font=("맑은 고딕", 10, "bold"), bg="#ffffff", fg="#0284c7", padx=12, pady=10)
        card.pack(fill=tk.X, pady=(0, 10))

        self.toast_var = tk.BooleanVar(value=self.config.enable_notifications)
        toast_chk = tk.Checkbutton(
            card, text="새 쿠폰 자동 등록 시 윈도우 우측 하단 팝업(토스트) 알림 받기",
            variable=self.toast_var, font=("맑은 고딕", 9), bg="#ffffff", activebackground="#ffffff"
        )
        toast_chk.pack(anchor="w")

        test_btn = ttk.Button(card, text="🔔 알림 테스트", command=self._test_notification)
        test_btn.pack(anchor="w", pady=(6, 0))

    def _build_automation_card(self, parent):
        card = tk.LabelFrame(parent, text=" 백그라운드 자동화 (5분 간격) ", font=("맑은 고딕", 10, "bold"), bg="#ffffff", fg="#0284c7", padx=12, pady=10)
        card.pack(fill=tk.X, pady=(0, 10))

        status_frame = tk.Frame(card, bg="#ffffff")
        status_frame.pack(fill=tk.X, pady=(0, 8))

        tk.Label(status_frame, text="스케줄러 상태: ", font=("맑은 고딕", 9, "bold"), bg="#ffffff").pack(side=tk.LEFT)
        self.sched_status_label = tk.Label(status_frame, text="확인 중...", font=("맑은 고딕", 9), bg="#ffffff")
        self.sched_status_label.pack(side=tk.LEFT)

        btn_row = tk.Frame(card, bg="#ffffff")
        btn_row.pack(fill=tk.X)

        enable_btn = ttk.Button(btn_row, text="▶️ 5분 자동 등록 켜기", style="Success.TButton", command=self._enable_scheduler)
        enable_btn.pack(side=tk.LEFT, padx=(0, 6))

        disable_btn = ttk.Button(btn_row, text="⏹️ 자동 등록 끄기", style="Danger.TButton", command=self._disable_scheduler)
        disable_btn.pack(side=tk.LEFT, padx=(0, 6))

        once_btn = ttk.Button(btn_row, text="⚡ 지금 즉시 쿠폰 등록", style="Primary.TButton", command=self._run_once_async)
        once_btn.pack(side=tk.RIGHT)

    def _build_history_card(self, parent):
        card = tk.LabelFrame(parent, text=" 최근 쿠폰 등록 내역 ", font=("맑은 고딕", 10, "bold"), bg="#ffffff", fg="#0284c7", padx=12, pady=10)
        card.pack(fill=tk.BOTH, expand=True)

        columns = ("status", "code", "source", "time")
        self.tree = ttk.Treeview(card, columns=columns, show="headings", height=6)
        self.tree.heading("status", text="결과")
        self.tree.heading("code", text="쿠폰 코드")
        self.tree.heading("source", text="출처")
        self.tree.heading("time", text="등록 시각")

        self.tree.column("status", width=90, anchor="center")
        self.tree.column("code", width=220, anchor="w")
        self.tree.column("source", width=80, anchor="center")
        self.tree.column("time", width=140, anchor="center")

        scrollbar = ttk.Scrollbar(card, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    # ==========================================
    # 비즈니스 로직
    # ==========================================
    def _check_login_status_async(self):
        def worker():
            is_logged_in = self.client.is_logged_in()
            self.root.after(0, lambda: self._update_login_ui(is_logged_in))

        self.login_status_label.config(text="확인 중...", fg="#64748b")
        threading.Thread(target=worker, daemon=True).start()

    def _update_login_ui(self, is_logged_in: bool):
        if is_logged_in:
            self.login_status_label.config(text="✅ 정상 로그인됨 (세션 유효)", fg="#16a34a")
        else:
            self.login_status_label.config(text="⚠️ 로그인 필요 (아래 버튼으로 로그인해 주세요)", fg="#dc2626")

    def _on_login_click(self):
        messagebox.showinfo("로그인 안내", "잠시 후 브라우저 창이 열립니다.\n넥슨 계정으로 로그인(OTP 인증)을 완료해 주세요.")
        
        def worker():
            success = self.client.interactive_login()
            self.root.after(0, lambda: self._after_login(success))

        threading.Thread(target=worker, daemon=True).start()

    def _after_login(self, success: bool):
        if success:
            messagebox.showinfo("로그인 성공", "넥슨 로그인 세션이 성공적으로 저장되었습니다!\n이제 5분마다 무인으로 자동 등록됩니다.")
        else:
            messagebox.showwarning("로그인 미완료", "로그인이 완료되지 않았거나 제한 시간을 초과했습니다.")
        self._check_login_status_async()

    def _check_scheduler_status(self):
        try:
            res = subprocess.run(["schtasks", "/query", "/tn", TASK_NAME], capture_output=True)
            if res.returncode == 0:
                self.sched_status_label.config(text="🟢 활성화됨 (5분마다 백그라운드 자동 실행)", fg="#16a34a")
            else:
                self.sched_status_label.config(text="⚪ 비활성화됨 (아래 [켜기] 버튼을 누르세요)", fg="#64748b")
        except Exception:
            self.sched_status_label.config(text="알 수 없음", fg="#64748b")

    def _enable_scheduler(self):
        exe_path = sys.executable if getattr(sys, "frozen", False) else os.path.abspath(sys.argv[0])
        cmd = f'schtasks /create /tn "{TASK_NAME}" /tr "\"{exe_path}\" once" /sc MINUTE /mo 5 /f'
        try:
            res = subprocess.run(cmd, capture_output=True, shell=True)
            if res.returncode == 0:
                messagebox.showinfo("스케줄러 등록 완료", "5분마다 백그라운드에서 자동으로 쿠폰을 등록하도록 설정되었습니다!\n창을 닫아도 알아서 동작합니다.")
            else:
                err_msg = res.stderr.decode("cp949", errors="replace") if res.stderr else "알 수 없는 오류"
                messagebox.showerror("등록 실패", f"스케줄러 등록에 실패했습니다:\n{err_msg}")
        except Exception as e:
            messagebox.showerror("오류", str(e))
        self._check_scheduler_status()

    def _disable_scheduler(self):
        cmd = f'schtasks /delete /tn "{TASK_NAME}" /f'
        try:
            res = subprocess.run(cmd, capture_output=True, shell=True)
            messagebox.showinfo("스케줄러 해제", "5분 자동 등록 스케줄러가 해제되었습니다.")
        except Exception as e:
            messagebox.showerror("오류", str(e))
        self._check_scheduler_status()

    def _run_once_async(self):
        messagebox.showinfo("실행 시작", "지금 즉시 서버/인벤/펨코 쿠폰을 수집하여 넥슨에 등록합니다.\n완료되면 알림창이 뜹니다.")
        def worker():
            sched = CouponScheduler(self.config)
            sched.run_once()
            self.root.after(0, self._after_run_once)

        threading.Thread(target=worker, daemon=True).start()

    def _after_run_once(self):
        messagebox.showinfo("완료", "쿠폰 확인 및 등록 작업이 완료되었습니다!")
        self._refresh_history()

    def _test_notification(self):
        notifier = Notifier(enable_notifications=True)
        notifier.notify("⚽ FC 온라인 자동 쿠폰", "테스트 알림이 정상적으로 작동합니다!", "SUCCESS")

    def _refresh_history(self):
        for item in self.tree.get_children():
            self.tree.delete(item)

        history = self.storage.get_history(limit=20)
        for row in history:
            self.tree.insert("", tk.END, values=(
                row["status"],
                row["code"],
                row["source"],
                row.get("applied_at", "")[:19].replace("T", " ")
            ))

    def _save_settings(self):
        self.config.enable_notifications = self.toast_var.get()
        save_config(self.config)
        messagebox.showinfo("저장 완료", "설정이 성공적으로 저장되었습니다.")

def launch_gui():
    root = tk.Tk()
    app = AutoCouponGUI(root)
    root.mainloop()
