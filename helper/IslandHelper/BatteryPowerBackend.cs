using System.Runtime.InteropServices;
using System.Text.Json;

// Battery state, alert thresholds, and Windows power-plan operations are isolated
// from the Network Monitor backend. The shared scheduler calls this at low frequency.
internal sealed class BatteryPowerBackend
{
    private readonly Action<object> send;
    private bool notifications = true;
    private int lowThreshold = 20, criticalThreshold = 10, alertLevel;

    public BatteryPowerBackend(Action<object> send) => this.send = send;

    public void Configure(JsonElement request)
    {
        if (request.TryGetProperty("batteryNotifications", out var enabled)) notifications = enabled.ValueKind == JsonValueKind.True;
        if (request.TryGetProperty("lowBatteryThreshold", out var low) && low.TryGetInt32(out var lowValue)) lowThreshold = Math.Clamp(lowValue, 5, 50);
        if (request.TryGetProperty("criticalBatteryThreshold", out var critical) && critical.TryGetInt32(out var criticalValue)) criticalThreshold = Math.Clamp(criticalValue, 5, 20);
    }

    [StructLayout(LayoutKind.Sequential)] private struct SystemPowerStatus
    {
        public byte ACLineStatus, BatteryFlag, BatteryLifePercent, Reserved;
        public uint BatteryLifeTime, BatteryFullLifeTime;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetSystemPowerStatus(out SystemPowerStatus status);

    public object ReadSnapshot()
    {
        try
        {
            if (!GetSystemPowerStatus(out var s)) return new { available = false, status = "unavailable", percent = (int?)null, charging = (bool?)null, acConnected = (bool?)null, remainingSeconds = (long?)null };
            bool absent = (s.BatteryFlag & 128) != 0;
            int? percent = !absent && s.BatteryLifePercent <= 100 ? s.BatteryLifePercent : null;
            bool? charging = absent ? null : (s.BatteryFlag & 8) != 0 ? true : (s.BatteryFlag & 4) != 0 ? false : null;
            long? remaining = s.BatteryLifeTime != uint.MaxValue && !absent ? s.BatteryLifeTime : null;
            CheckAlert(percent);
            return new { available = !absent && percent.HasValue, status = absent ? "no-battery" : percent.HasValue ? "available" : "unsupported", percent, charging, acConnected = s.ACLineStatus == 255 ? (bool?)null : s.ACLineStatus == 1, remainingSeconds = remaining, powerMode = ReadPowerMode(), currentWatts = (double?)null, dischargeWatts = (double?)null, chargingWatts = (double?)null };
        }
        catch { return new { available = false, status = "unavailable", percent = (int?)null, charging = (bool?)null, acConnected = (bool?)null, remainingSeconds = (long?)null }; }
    }

    private void CheckAlert(int? percent)
    {
        if (!notifications) { alertLevel = 0; return; }
        if (!percent.HasValue) return;
        if (percent.Value > lowThreshold + 5) alertLevel = 0;
        var level = percent.Value <= criticalThreshold ? 2 : percent.Value <= lowThreshold ? 1 : 0;
        if (level <= alertLevel) return;
        alertLevel = level;
        send(new { type = "battery-power-alert", title = level == 2 ? "Critical battery" : "Low battery", body = $"Battery is at {percent.Value}%." });
    }

    private static readonly Guid SaverPlan = new("961cc777-2547-4f9d-8174-7d86181b8a7a");
    private static readonly Guid BalancedPlan = new("381b4222-f694-41f0-9685-ff5bb260df2e");
    private static readonly Guid PerformancePlan = new("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
    [DllImport("powrprof.dll")] private static extern uint PowerGetActiveScheme(IntPtr root, out IntPtr scheme);
    [DllImport("powrprof.dll")] private static extern uint PowerSetActiveScheme(IntPtr root, ref Guid scheme);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
    private static string? ReadPowerMode()
    {
        IntPtr ptr = IntPtr.Zero;
        try { if (PowerGetActiveScheme(IntPtr.Zero, out ptr) != 0 || ptr == IntPtr.Zero) return null; var id = Marshal.PtrToStructure<Guid>(ptr); return id == SaverPlan ? "efficiency" : id == BalancedPlan ? "balanced" : id == PerformancePlan ? "performance" : "custom"; }
        catch { return null; }
        finally { if (ptr != IntPtr.Zero) LocalFree(ptr); }
    }

    public void SetPowerMode(JsonElement request)
    {
        try
        {
            var value = request.TryGetProperty("mode", out var m) ? m.GetString() : null;
            var id = value switch { "efficiency" => SaverPlan, "balanced" => BalancedPlan, "performance" => PerformancePlan, _ => Guid.Empty };
            if (id == Guid.Empty) { send(new { type = "battery-power-action", ok = false, error = "Unsupported power mode." }); return; }
            var result = PowerSetActiveScheme(IntPtr.Zero, ref id);
            var actual = ReadPowerMode();
            var ok = result == 0 && actual == value;
            send(new { type = "battery-power-action", ok, mode = actual, error = ok ? null : $"Windows did not confirm the requested power mode (code {result})." });
            send(new { type = "battery-power-snapshot", snapshot = ReadSnapshot() });
        }
        catch (Exception ex) { send(new { type = "battery-power-action", ok = false, error = $"Could not change Windows power mode: {ex.Message}" }); }
    }
}
