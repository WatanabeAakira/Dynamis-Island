using System.Runtime.InteropServices;
using Microsoft.Win32;

// Native monitor inventory. DisplaySettingsChanged is raised by Windows when
// a monitor is attached, removed, reconfigured, or made primary.
internal sealed class DisplayMonitorService : IDisposable
{
    private readonly Action<object> publish;
    private bool disposed;

    internal DisplayMonitorService(Action<object> publish)
    {
        this.publish = publish;
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        Publish();
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e) => Publish();

    internal void Publish()
    {
        if (disposed) return;
        try
        {
            var monitors = new List<object>();
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (handle, _, _, _) =>
            {
                var info = new MonitorInfo { cbSize = Marshal.SizeOf<MonitorInfo>() };
                if (GetMonitorInfo(handle, ref info))
                {
                    var mode = new DevMode { dmDeviceName = info.szDevice, dmSize = (short)Marshal.SizeOf<DevMode>() };
                    var refresh = EnumDisplaySettings(info.szDevice, -1, ref mode) ? mode.dmDisplayFrequency : 0;
                    var device = new DisplayDevice { cb = Marshal.SizeOf<DisplayDevice>() };
                    var monitorId = EnumDisplayDevices(info.szDevice, 0, ref device, 0) && !string.IsNullOrWhiteSpace(device.DeviceID)
                        ? device.DeviceID.Trim() : info.szDevice;
                    monitors.Add(new { id = info.szDevice, monitorId, name = info.szDevice.TrimStart('\\', '.'), bounds = new { x = info.rcMonitor.Left, y = info.rcMonitor.Top, width = info.rcMonitor.Right - info.rcMonitor.Left, height = info.rcMonitor.Bottom - info.rcMonitor.Top }, primary = (info.dwFlags & 1) != 0, refreshRate = refresh > 1 ? refresh : (int?)null });
                }
                return true;
            }, IntPtr.Zero);
            publish(new { type = "displays", monitors });
        }
        catch { }
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DevMode devMode);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool EnumDisplayDevices(string? device, uint deviceNumber, ref DisplayDevice displayDevice, uint flags);

    private delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfo { public int cbSize; public Rect rcMonitor; public Rect rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayDevice
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public uint StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DevMode
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
        public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }
}
