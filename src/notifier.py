import subprocess

class Notifier:
    def __init__(self, enable_notifications: bool = True):
        self.enable_notifications = enable_notifications

    def notify(self, title: str, message: str, status: str = "INFO"):
        print(f"[{status}] {title}: {message}")
        if self.enable_notifications:
            self._send_windows_notification(title, message)

    def _send_windows_notification(self, title: str, message: str):
        try:
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
        except Exception:
            pass
