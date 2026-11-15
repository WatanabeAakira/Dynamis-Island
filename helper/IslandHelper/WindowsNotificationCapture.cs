using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;

// Desktop Windows doesn't expose UserNotificationListener to this app without
// package identity. Observe the notification surfaces Windows presents through
// UI Automation instead, without reading unrelated application windows.
sealed class WindowsNotificationCapture : IDisposable
{
    static readonly string[] Hosts = ["ShellExperienceHost", "StartMenuExperienceHost", "explorer"];
    readonly AutomationEventHandler openedHandler;
    readonly AutomationEventHandler notificationHandler;
    readonly System.Threading.Timer scanTimer;
    readonly object gate = new();
    bool enabled;
    string lastKey = "";
    long lastAt;

    public WindowsNotificationCapture()
    {
        openedHandler = OnWindowOpened;
        notificationHandler = OnNotification;
        Automation.AddAutomationEventHandler(WindowPattern.WindowOpenedEvent, AutomationElement.RootElement,
            TreeScope.Children, openedHandler);
        Automation.AddAutomationEventHandler(AutomationElement.NotificationEvent, AutomationElement.RootElement,
            TreeScope.Descendants, notificationHandler);
        // Some Windows builds reuse a shell window for every toast and don't raise
        // WindowOpened. A lightweight scan of shell-owned visible windows covers that case.
        scanTimer = new System.Threading.Timer(_ => ScanVisibleShellWindows(), null, 250, 500);
    }

    public void SetEnabled(bool value)
    {
        lock (gate) enabled = value;
        Program.Send(new { type = "windows-notifications-status", enabled = value, available = true });
    }

    void OnWindowOpened(object sender, AutomationEventArgs args)
    {
        if (sender is not AutomationElement element) return;
        if (IsToastSurface(element)) Capture(element);
    }

    void OnNotification(object sender, AutomationEventArgs args)
    {
        if (sender is not AutomationElement element) return;
        Capture(element);
    }

    void ScanVisibleShellWindows()
    {
        lock (gate) if (!enabled) return;
        try
        {
            EnumWindows((handle, _) =>
            {
                if (!IsWindowVisible(handle)) return true;
                GetWindowThreadProcessId(handle, out var pid);
                if (pid == 0 || !IsNotificationHost(unchecked((int)pid))) return true;
                try
                {
                    var element = AutomationElement.FromHandle(handle);
                    if (IsToastSurface(element)) Capture(element);
                }
                catch (ElementNotAvailableException) { }
                return true;
            }, IntPtr.Zero);
        }
        catch { }
    }

    static bool IsToastSurface(AutomationElement element)
    {
        try
        {
            var className = element.Current.ClassName;
            if (className.Contains("Toast", StringComparison.OrdinalIgnoreCase)) return true;
            if (!GetWindowRect(new IntPtr(element.Current.NativeWindowHandle), out var rect)) return false;
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            var screenWidth = GetSystemMetrics(0);
            var screenHeight = GetSystemMetrics(1);
            // Shell's toast banner sits as a small window near the bottom-right corner.
            return width is > 0 and < 650 && height is > 0 and < 350
                && rect.Left > screenWidth - 700 && rect.Bottom > screenHeight - 500;
        }
        catch { return false; }
    }

    void Capture(AutomationElement element)
    {
        lock (gate) if (!enabled) return;
        try
        {
            var processId = element.Current.ProcessId;
            var lines = ReadText(element);
            if (!IsNotificationHost(processId)) return;
            if (lines.Count == 0) return;

            var windowName = Safe(() => element.Current.Name, "");
            // Toast trees commonly expose the app name followed by title and body.
            // Keep the full text if the shell exposes only a single accessible name.
            var appName = lines.Count > 1 ? lines[0] : "Windows";
            var title = lines.Count > 1 ? lines[1] : lines[0];
            var body = lines.Count > 2 ? string.Join(" · ", lines.Skip(2)) : "";
            if (lines.Count == 1 && !string.IsNullOrWhiteSpace(windowName) && windowName != title)
            {
                appName = windowName;
                body = title;
                title = "Notifikasi baru";
            }

            appName = Clean(appName, 80);
            title = Clean(title, 120);
            body = Clean(body, 240);
            if (title.Length == 0 || IsIsland(appName)) return;

            var key = $"{appName}\n{title}\n{body}";
            var now = Environment.TickCount64;
            lock (gate)
            {
                if (!enabled || (key == lastKey && now - lastAt < 2500)) return;
                lastKey = key;
                lastAt = now;
            }
            Program.Send(new { type = "windows-notification", app = appName, title, body, processId, ts = DateTimeOffset.Now.ToUnixTimeMilliseconds() });
        }
        catch (ElementNotAvailableException) { }
        catch (InvalidOperationException) { }
        catch (ArgumentException) { }
    }

    static bool IsNotificationHost(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            var name = process.ProcessName;
            return Hosts.Any(host => name.Equals(host, StringComparison.OrdinalIgnoreCase));
        }
        catch { return false; }
    }

    static List<string> ReadText(AutomationElement root)
    {
        var result = new List<string>();
        var queue = new Queue<AutomationElement>();
        queue.Enqueue(root);
        while (queue.Count > 0 && result.Count < 20)
        {
            var current = queue.Dequeue();
            try
            {
                var name = Clean(current.Current.Name, 240);
                var type = current.Current.ControlType;
                if (name.Length > 0 && (type == ControlType.Text || current == root))
                    result.Add(name);

                var child = TreeWalker.RawViewWalker.GetFirstChild(current);
                while (child != null && result.Count < 20)
                {
                    queue.Enqueue(child);
                    child = TreeWalker.RawViewWalker.GetNextSibling(child);
                }
            }
            catch (ElementNotAvailableException) { }
        }
        return result.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    static string Clean(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var cleaned = string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return cleaned.Length > max ? cleaned[..max] : cleaned;
    }

    static string Safe(Func<string> read, string fallback)
    {
        try { return read(); } catch { return fallback; }
    }

    static bool IsIsland(string name) => name.Contains("Dynamis Island", StringComparison.OrdinalIgnoreCase)
        || name.Contains("IslandHelper", StringComparison.OrdinalIgnoreCase);

    public void Dispose()
    {
        scanTimer.Dispose();
        try { Automation.RemoveAutomationEventHandler(WindowPattern.WindowOpenedEvent, AutomationElement.RootElement, openedHandler); } catch { }
        try { Automation.RemoveAutomationEventHandler(AutomationElement.NotificationEvent, AutomationElement.RootElement, notificationHandler); } catch { }
    }

    delegate bool EnumWindowsProc(IntPtr handle, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool GetWindowRect(IntPtr handle, out NativeRect rect);
    [DllImport("user32.dll")]
    static extern int GetSystemMetrics(int index);
    [StructLayout(LayoutKind.Sequential)]
    struct NativeRect { public int Left, Top, Right, Bottom; }
}
