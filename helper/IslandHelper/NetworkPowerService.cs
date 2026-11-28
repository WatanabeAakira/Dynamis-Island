using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Text.Json;

// One bounded sampler for both Island tabs. Network usage checkpoints are local and
// intentionally contain adapter identity/counters only; no addresses or SSID are read.
internal sealed class NetworkPowerService : IDisposable
{
    private readonly Action<object> send;
    private readonly BatteryPowerBackend batteryBackend;
    private readonly string statePath;
    private readonly object gate = new();
    private CancellationTokenSource? cts;
    private string mode = "hidden", activeTab = "";
    private bool networkEnabled = true, batteryEnabled = true;
    private bool monthlyAccounting = true;
    private bool notifications = true, limitAlerted;
    private string? preferredWifiId;
    private double? monthlyLimitGb;
    private bool retainHistory = true;
    private DateTime periodStart = DateTime.MinValue;
    private double monthDown, monthUp, monthEthernetDown, monthEthernetUp, sessionDown, sessionUp;
    private readonly List<MonthRecord> history = new();
    private string? previousAdapter;
    private long previousRx, previousTx;
    private DateTime previousAt;
    private DateTime lastBatteryAt = DateTime.MinValue;
    private bool baseline;

    private sealed record MonthRecord(DateTime Start, double Download, double Upload, double EthernetDownload = 0, double EthernetUpload = 0);
    private sealed record Persisted(int Version, DateTime PeriodStart, double Download, double Upload,
        string? AdapterId, long ReceiveBytes, long SendBytes, List<MonthRecord>? History, bool LimitAlerted = false,
        double EthernetDownload = 0, double EthernetUpload = 0);

    public NetworkPowerService(Action<object> send, string dataDirectory)
    {
        this.send = send;
        batteryBackend = new BatteryPowerBackend(send);
        Directory.CreateDirectory(dataDirectory);
        statePath = Path.Combine(dataDirectory, "network-usage.json");
        Load();
    }

    public void Configure(JsonElement request)
    {
        lock (gate)
        {
            if (request.TryGetProperty("mode", out var m)) mode = SafeString(m, "hidden");
            if (request.TryGetProperty("activeTab", out var tab)) activeTab = SafeString(tab, "");
            if (request.TryGetProperty("networkEnabled", out var ne)) networkEnabled = ne.ValueKind == JsonValueKind.True;
            if (request.TryGetProperty("batteryEnabled", out var be)) batteryEnabled = be.ValueKind == JsonValueKind.True;
            batteryBackend.Configure(request);
            if (request.TryGetProperty("monthlyAccounting", out var ma)) monthlyAccounting = ma.ValueKind != JsonValueKind.False;
            if (request.TryGetProperty("networkNotifications", out var nn)) notifications = nn.ValueKind == JsonValueKind.True;
            if (request.TryGetProperty("preferredWifiId", out var wifi)) preferredWifiId = wifi.ValueKind == JsonValueKind.String ? wifi.GetString() : null;
            if (request.TryGetProperty("monthlyLimitGb", out var limit)) monthlyLimitGb = limit.ValueKind == JsonValueKind.Number && limit.GetDouble() > 0 ? Math.Clamp(limit.GetDouble(), 1, 100000) : null;
            if (request.TryGetProperty("retainHistory", out var retain)) retainHistory = retain.ValueKind != JsonValueKind.False;
            if (!retainHistory) history.Clear();
            if (cts == null) { cts = new CancellationTokenSource(); _ = Run(cts.Token); }
        }
    }

    private static string SafeString(JsonElement value, string fallback) => value.ValueKind == JsonValueKind.String ? value.GetString() ?? fallback : fallback;
    private int Interval { get { lock (gate) return mode == "expanded" && (activeTab == "network-monitor" || activeTab == "battery-power") ? 1000 : mode == "hover" ? 3000 : 5000; } }

    private async Task Run(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try { Sample(); }
            catch (Exception ex) { send(new { type = "network-power-error", message = ex.Message }); }
            try { await Task.Delay(Interval, token); } catch (OperationCanceledException) { break; }
        }
    }

    private void Sample()
    {
        bool net, battery; lock (gate) { net = networkEnabled; battery = batteryEnabled; }
        if (net) SampleNetwork();
        var now = DateTime.UtcNow;
        if (battery && (now - lastBatteryAt).TotalSeconds >= 15)
        {
            lastBatteryAt = now;
            send(new { type = "battery-power-snapshot", snapshot = batteryBackend.ReadSnapshot() });
        }
    }

    private void SampleNetwork()
    {
        NetworkInterface? adapter = null;
        try
        {
            var all = NetworkInterface.GetAllNetworkInterfaces()
                .Where(IsMonitorableInterface)
                .OrderBy(n => n.Id, StringComparer.OrdinalIgnoreCase).ToArray();
            var preferred = all.FirstOrDefault(n => n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 && n.Id == preferredWifiId);
            var activeConnection = all.Where(n => n.OperationalStatus == OperationalStatus.Up)
                .OrderByDescending(HasDefaultGateway).ThenByDescending(n => n.Speed > 0).ThenByDescending(n => n.Speed).FirstOrDefault();
            lock (gate) adapter = (preferred?.OperationalStatus == OperationalStatus.Up ? preferred : null)
                ?? activeConnection ?? preferred
                ?? all.FirstOrDefault(n => n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                ?? all.FirstOrDefault(n => n.NetworkInterfaceType == NetworkInterfaceType.Ethernet);
        }
        catch { }

        DateTime now = DateTime.Now;
        double down = 0, up = 0;
        long rx = 0, tx = 0;
        bool validDelta = false;
        string? id = adapter?.Id;
        string status = adapter == null ? "unavailable" : adapter.OperationalStatus == OperationalStatus.Up ? "connected" : "disconnected";
        string? name = adapter?.Name;
        double elapsedSeconds = 1;
        if (adapter != null && adapter.OperationalStatus == OperationalStatus.Up)
        {
            try
            {
                var stats = adapter.GetIPStatistics();
                rx = stats.BytesReceived;
                tx = stats.BytesSent;
            }
            catch { status = "unavailable"; }
        }

        lock (gate)
        {
            if (periodStart == DateTime.MinValue || periodStart.Year != now.Year || periodStart.Month != now.Month)
            {
                if (periodStart != DateTime.MinValue && retainHistory) SaveHistoryRecord(new(periodStart, monthDown, monthUp, monthEthernetDown, monthEthernetUp));
                while (history.Count > 24) history.RemoveAt(0);
                periodStart = new DateTime(now.Year, now.Month, 1);
                monthDown = monthUp = monthEthernetDown = monthEthernetUp = 0;
                limitAlerted = false;
                baseline = false;
            }
            if (adapter != null && status == "connected")
            {
                if (baseline && previousAdapter == id && rx >= previousRx && tx >= previousTx)
                {
                    elapsedSeconds = Math.Max(.001, (now - previousAt).TotalSeconds);
                    down = rx - previousRx; up = tx - previousTx;
                    validDelta = true;
                    if (monthlyAccounting && adapter!.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) { monthDown += down; monthUp += up; }
                    else if (monthlyAccounting && adapter!.NetworkInterfaceType == NetworkInterfaceType.Ethernet) { monthEthernetDown += down; monthEthernetUp += up; }
                    sessionDown += down; sessionUp += up;
                }
                // Adapter change, disconnect, and counter reset establish a fresh baseline;
                // the unobserved interval is never guessed or backfilled.
                previousAdapter = id; previousRx = rx; previousTx = tx; previousAt = now; baseline = true;
            }
            else baseline = false;
            Persist();
            var limitBytes = monthlyLimitGb.HasValue ? monthlyLimitGb.Value * 1024 * 1024 * 1024 : (double?)null;
            var wifiUsed = monthDown + monthUp;
            var ethernetUsed = monthEthernetDown + monthEthernetUp;
            var used = wifiUsed + ethernetUsed;
            if (notifications && limitBytes.HasValue && used >= limitBytes.Value && !limitAlerted)
            {
                limitAlerted = true;
                send(new { type = "network-data-limit-alert", title = "Monthly data limit reached", body = "Combined Wi-Fi and Ethernet usage has reached or exceeded the configured limit." });
                Persist();
            }
            send(new { type = "network-monitor-snapshot", snapshot = new {
                timestamp = now, status,
                connectionType = adapter?.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "Wi-Fi" : adapter?.NetworkInterfaceType == NetworkInterfaceType.Ethernet ? "Ethernet" : null,
                adapterName = name, adapterId = id, linkSpeedBitsPerSecond = adapter != null && adapter.Speed > 0 ? (long?)adapter.Speed : null,
                downloadBytesPerSecond = validDelta ? (double?)(down / elapsedSeconds) : status == "disconnected" ? (double?)0d : null,
                uploadBytesPerSecond = validDelta ? (double?)(up / elapsedSeconds) : status == "disconnected" ? (double?)0d : null,
                sessionDownloadBytes = sessionDown, sessionUploadBytes = sessionUp,
                monthlyDownloadBytes = monthDown + monthEthernetDown, monthlyUploadBytes = monthUp + monthEthernetUp,
                monthlyWifiBytes = wifiUsed, monthlyEthernetBytes = ethernetUsed,
                accountingEnabled = monthlyAccounting,
                periodStart, periodEnd = periodStart.AddMonths(1).AddDays(-1), monthlyLimitBytes = limitBytes,
                remainingBytes = limitBytes.HasValue ? (double?)(limitBytes.Value - used) : null,
                usagePercent = limitBytes.HasValue ? (double?)(used / limitBytes.Value * 100) : null,
                limitExceeded = limitBytes.HasValue && used > limitBytes.Value,
                history = history.Select(h => new { start = h.Start, wifiDownloadBytes = h.Download, wifiUploadBytes = h.Upload, ethernetDownloadBytes = h.EthernetDownload, ethernetUploadBytes = h.EthernetUpload }).ToArray()
            }});
        }
    }

    private static bool IsMonitorableInterface(NetworkInterface network)
    {
        if (network.NetworkInterfaceType != NetworkInterfaceType.Wireless80211 && network.NetworkInterfaceType != NetworkInterfaceType.Ethernet) return false;
        var description = network.Description;
        return !new[] { "wfp", "filter", "virtual", "vpn", "tap", "tunnel", "loopback", "bridge", "qos", "scheduler", "native mac", "lightweight", "light weight" }
            .Any(token => description.Contains(token, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasDefaultGateway(NetworkInterface network)
    {
        try { return network.GetIPProperties().GatewayAddresses.Any(g => !IPAddress.Any.Equals(g.Address) && !IPAddress.IPv6Any.Equals(g.Address)); }
        catch { return false; }
    }

    private void Load()
    {
        try
        {
            var saved = JsonSerializer.Deserialize<Persisted>(File.ReadAllText(statePath));
            if (saved == null || saved.Version is not (1 or 2)) return;
            limitAlerted = saved.LimitAlerted;
            if (saved.History != null) history.AddRange(saved.History.TakeLast(24));
            if (saved.PeriodStart != DateTime.MinValue && (saved.PeriodStart.Year != DateTime.Now.Year || saved.PeriodStart.Month != DateTime.Now.Month))
                SaveHistoryRecord(new(saved.PeriodStart, Math.Max(0, saved.Download), Math.Max(0, saved.Upload), Math.Max(0, saved.EthernetDownload), Math.Max(0, saved.EthernetUpload)));
            if (saved.PeriodStart.Year == DateTime.Now.Year && saved.PeriodStart.Month == DateTime.Now.Month)
            {
                periodStart = saved.PeriodStart; monthDown = Math.Max(0, saved.Download); monthUp = Math.Max(0, saved.Upload);
                monthEthernetDown = Math.Max(0, saved.EthernetDownload); monthEthernetUp = Math.Max(0, saved.EthernetUpload);
                previousAdapter = saved.AdapterId; previousRx = Math.Max(0, saved.ReceiveBytes); previousTx = Math.Max(0, saved.SendBytes);
                baseline = false; // don't count time while the helper was stopped
            }
        }
        catch { }
    }

    private void SaveHistoryRecord(MonthRecord record)
    {
        var existing = history.FindIndex(item => item.Start.Year == record.Start.Year && item.Start.Month == record.Start.Month);
        if (existing >= 0) history[existing] = record;
        else history.Add(record);
        history.Sort((a, b) => a.Start.CompareTo(b.Start));
        while (history.Count > 24) history.RemoveAt(0);
    }

    private void Persist()
    {
        try
        {
            var data = new Persisted(2, periodStart, monthDown, monthUp, baseline ? previousAdapter : null,
                baseline ? previousRx : 0, baseline ? previousTx : 0, retainHistory ? history.TakeLast(24).ToList() : new(), limitAlerted, monthEthernetDown, monthEthernetUp);
            var tmp = statePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(data));
            File.Move(tmp, statePath, true);
        }
        catch { }
    }

    public void SetPowerMode(JsonElement request) => batteryBackend.SetPowerMode(request);

    public void Dispose() { lock (gate) { cts?.Cancel(); cts?.Dispose(); cts = null; Persist(); } }
}
