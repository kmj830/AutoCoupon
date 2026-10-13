import subprocess
import httpx
from typing import Optional

class Notifier:
    def __init__(self, discord_webhook_url: Optional[str] = None):
        self.discord_webhook_url = discord_webhook_url

    def notify(self, title: str, message: str, status: str = "INFO"):
        print(f"[{status}] {title}: {message}")
        self._send_windows_notification(title, message)
        if self.discord_webhook_url:
            self._send_discord(title, message, status)

    def _send_windows_notification(self, title: str, message: str):
        try:
            # PowerShell 기반 윈도우 토스트 알림 (별도 외부 C 바인딩 불필요)
            safe_title = title.replace("'", "''").replace('"', '`"')
            safe_message = message.replace("'", "''").replace('"', '`"')
            ps_script = f"""
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
            $textNodes = $template.GetElementsByTagName("text")
            $textNodes.Item(0).AppendChild($template.CreateTextNode('{safe_title}')) > $null
            $textNodes.Item(1).AppendChild($template.CreateTextNode('{safe_message}')) > $null
            $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("FC Online AutoCoupon")
            $notification = [Windows.UI.Notifications.ToastNotification]::new($template)
            $notifier.Show($notification)
            """
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, timeout=5)
        except Exception as e:
            # 백그라운드에서 알림 실패해도 전체 프로세스에 영향 없도록 pass
            pass

    def _send_discord(self, title: str, message: str, status: str):
        try:
            color = 0x3498DB
            if status == "SUCCESS":
                color = 0x2ECC71
            elif status in ("FAILED", "EXPIRED"):
                color = 0xE74C3C

            payload = {
                "embeds": [
                    {
                        "title": title,
                        "description": message,
                        "color": color
                    }
                ]
            }
            httpx.post(self.discord_webhook_url, json=payload, timeout=5.0)
        except Exception as e:
            print(f"[디스코드 알림 실패]: {e}")
