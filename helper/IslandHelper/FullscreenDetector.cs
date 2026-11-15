using System.Runtime.InteropServices;

// Deteksi aplikasi foreground yang menutupi seluruh monitor (termasuk borderless fullscreen).
// Window maximized biasa tidak dihitung karena ukurannya hanya sampai work area/taskbar.
internal static class FullscreenDetector
{
    const uint MonitorDefaultToNearest = 2;

    [StructLayout(LayoutKind.Sequential)]
    struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    struct MonitorInfo
    {
        public int Size;
        public Rect Monitor;
        public Rect Work;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device;
    }

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

    [DllImport("user32.dll")]
    static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

    public static bool IsForegroundFullscreen()
    {
        try
        {
            var window = GetForegroundWindow();
            if (window == IntPtr.Zero || !IsWindowVisible(window) || IsIconic(window)) return false;
            if (!GetWindowRect(window, out var bounds)) return false;

            var monitor = MonitorFromWindow(window, MonitorDefaultToNearest);
            if (monitor == IntPtr.Zero) return false;
            var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>(), Device = string.Empty };
            if (!GetMonitorInfo(monitor, ref info)) return false;

            // Toleransi 2 px untuk border dan rounding DPI. Pakai monitor bounds, bukan work area.
            const int tolerance = 2;
            return bounds.Left <= info.Monitor.Left + tolerance
                && bounds.Top <= info.Monitor.Top + tolerance
                && bounds.Right >= info.Monitor.Right - tolerance
                && bounds.Bottom >= info.Monitor.Bottom - tolerance;
        }
        catch
        {
            return false;
        }
    }
}
