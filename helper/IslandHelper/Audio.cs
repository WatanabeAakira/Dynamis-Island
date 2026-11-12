using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

// Kontrol audio Windows (Core Audio lewat NAudio): volume utama dan volume per aplikasi.
// Protokol (JSON per baris):
//   masuk : {"cmd":"audio-watch","mode":"off|master|full"}  {"cmd":"audio-master","value":0.5}  {"cmd":"audio-mastermute","value":true}
//           {"cmd":"audio-vol","key":"...","value":0.5}      {"cmd":"audio-mute","key":"...","value":true}
//   keluar: {"type":"audio","master":{vol,mute,name,peak},"sessions":[{key,name,exe,vol,mute,peak,active}]}
static class AudioControl
{
    sealed record OutputDevice(string Id, string Name);

    sealed class Group
    {
        public string Key = "";
        public string Name = "";
        public string Exe = "";
        public float Vol;
        public bool Mute;
        public bool Active;
        public float Peak;
        public List<uint> ProcessIds = new();
        public List<AudioSessionControl> Sessions = new();
    }

    static readonly object gate = new();
    static MMDeviceEnumerator? enumerator;
    static MMDevice? device;
    static DateTime deviceAt = DateTime.MinValue;
    static Timer? timer;
    static string mode = "off";
    static readonly Dictionary<uint, (string Name, string Exe)> procs = new();
    static List<OutputDevice> outputDevices = new();
    static DateTime outputDevicesAt = DateTime.MinValue;

    static float Clamp(double v) => (float)Math.Min(1.0, Math.Max(0.0, v));

    public static void Handle(string cmd, JsonElement e)
    {
        try
        {
            switch (cmd)
            {
                case "audio-watch":
                    SetMode(e.GetProperty("mode").GetString() ?? "off");
                    return;
                case "audio-output":
                    try
                    {
                        SetDefaultOutput(e.GetProperty("id").GetString() ?? "");
                        Program.Send(new { type = "audio-output-result", ok = true });
                        Push();
                    }
                    catch (Exception ex)
                    {
                        Program.Send(new { type = "audio-output-result", ok = false, error = ex.Message });
                    }
                    return;
                case "audio-open":
                    try { OpenApplication(e.GetProperty("key").GetString() ?? ""); }
                    catch (Exception ex) { Program.Send(new { type = "audio-open-result", ok = false, error = ex.Message }); }
                    return;
                case "audio-master":
                    lock (gate) Dev().AudioEndpointVolume.MasterVolumeLevelScalar = Clamp(e.GetProperty("value").GetDouble());
                    break;
                case "audio-mastermute":
                    lock (gate) Dev().AudioEndpointVolume.Mute = e.GetProperty("value").GetBoolean();
                    break;
                case "audio-vol":
                case "audio-mute":
                    lock (gate)
                    {
                        var key = e.GetProperty("key").GetString();
                        var g = Groups(Dev()).FirstOrDefault(x => x.Key == key);
                        if (g != null)
                        {
                            foreach (var s in g.Sessions)
                            {
                                if (cmd == "audio-vol") s.SimpleAudioVolume.Volume = Clamp(e.GetProperty("value").GetDouble());
                                else s.SimpleAudioVolume.Mute = e.GetProperty("value").GetBoolean();
                            }
                        }
                    }
                    break;
            }
            Push();
        }
        catch { /* perangkat audio bisa berganti di tengah jalan; siklus berikutnya memperbaiki */ }
    }

    static void SetMode(string m)
    {
        mode = m;
        timer?.Dispose();
        timer = null;
        if (m == "off") return;
        timer = new Timer(_ => Push(), null, 0, m == "full" ? 200 : 1000);
    }

    // Perangkat keluaran bawaan; dicek ulang tiap 3 detik supaya ikut berganti (mis. headphone dicabut)
    static MMDevice Dev()
    {
        enumerator ??= new MMDeviceEnumerator();
        if (device == null || (DateTime.UtcNow - deviceAt).TotalSeconds > 3)
        {
            var next = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            if (device == null || next.ID != device.ID)
            {
                device?.Dispose();
                device = next;
            }
            else next.Dispose();
            deviceAt = DateTime.UtcNow;
        }
        return device!;
    }

    static List<OutputDevice> OutputDevices()
    {
        if ((DateTime.UtcNow - outputDevicesAt).TotalSeconds < 3) return outputDevices;
        enumerator ??= new MMDeviceEnumerator();
        var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
        try
        {
            outputDevices = devices.Select(d => new OutputDevice(d.ID, d.FriendlyName)).ToList();
            outputDevicesAt = DateTime.UtcNow;
        }
        finally
        {
            foreach (var d in devices) d.Dispose();
        }
        return outputDevices;
    }

    static void SetDefaultOutput(string id)
    {
        lock (gate)
        {
            if (!OutputDevices().Any(d => d.Id == id))
                throw new ArgumentException("Perangkat output tidak tersedia.");

            var clientType = Type.GetTypeFromCLSID(new Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9"), true)
                ?? throw new InvalidOperationException("Antarmuka perangkat audio tidak tersedia.");
            var client = (IPolicyConfig)Activator.CreateInstance(clientType)!;
            Marshal.ThrowExceptionForHR(client.SetDefaultEndpoint(id, ERole.eConsole));
            Marshal.ThrowExceptionForHR(client.SetDefaultEndpoint(id, ERole.eMultimedia));
            Marshal.ThrowExceptionForHR(client.SetDefaultEndpoint(id, ERole.eCommunications));
            device?.Dispose();
            device = null;
            deviceAt = DateTime.MinValue;
            outputDevicesAt = DateTime.MinValue;
        }
    }

    static void OpenApplication(string key)
    {
        lock (gate)
        {
            var group = Groups(Dev()).FirstOrDefault(g => g.Key == key);
            if (group == null || string.IsNullOrEmpty(group.Exe))
            {
                Program.Send(new { type = "audio-open-result", ok = false, error = "Aplikasi tidak tersedia." });
                return;
            }

            foreach (var pid in group.ProcessIds)
            {
                try
                {
                    using var process = Process.GetProcessById((int)pid);
                    var handle = process.MainWindowHandle;
                    if (handle == IntPtr.Zero) continue;
                    ShowWindow(handle, 9);
                    SetForegroundWindow(handle);
                    Program.Send(new { type = "audio-open-result", ok = true });
                    return;
                }
                catch { }
            }

            if (!File.Exists(group.Exe))
            {
                Program.Send(new { type = "audio-open-result", ok = false, error = "Jendela aplikasi tidak ditemukan dan file aplikasinya sudah tidak tersedia." });
                return;
            }
            Process.Start(new ProcessStartInfo { FileName = group.Exe, UseShellExecute = true });
            Program.Send(new { type = "audio-open-result", ok = true });
        }
    }

    static void Push()
    {
        if (!Monitor.TryEnter(gate)) return; // masih sibuk dengan siklus sebelumnya
        try
        {
            var dev = Dev();
            var ev = dev.AudioEndpointVolume;
            object? sessions = null;
            if (mode == "full")
            {
                sessions = Groups(dev)
                    .Select(g => new { key = g.Key, name = g.Name, exe = g.Exe, processIds = g.ProcessIds, vol = g.Vol, mute = g.Mute, peak = g.Peak, active = g.Active })
                    .ToList();
            }
            Program.Send(new
            {
                type = "audio",
                master = new { vol = ev.MasterVolumeLevelScalar, mute = ev.Mute, name = dev.FriendlyName, id = dev.ID, peak = dev.AudioMeterInformation.MasterPeakValue },
                outputDevices = OutputDevices(),
                sessions
            });
        }
        catch { }
        finally { Monitor.Exit(gate); }
    }

    enum ERole
    {
        eConsole,
        eMultimedia,
        eCommunications
    }

    [ComImport]
    [Guid("f8679f50-850a-41cf-9c72-430f290290c8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr format);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int defaultFormat, out IntPtr format);
        [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr endpointFormat, IntPtr mixFormat);
        [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr period);
        [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);
        [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);
        [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr key, IntPtr value);
        [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr key, IntPtr value);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ERole role);
        [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int visible);
    }

    // Sesi dengan aplikasi yang sama (mis. beberapa proses Chrome) digabung jadi satu baris
    static List<Group> Groups(MMDevice dev)
    {
        var map = new Dictionary<string, Group>();
        var mgr = dev.AudioSessionManager;
        mgr.RefreshSessions();
        var sc = mgr.Sessions;
        for (int i = 0; i < sc.Count; i++)
        {
            try
            {
                var s = sc[i];
                bool sys = s.IsSystemSoundsSession;
                string name = "Suara sistem";
                string exe = "";
                uint pid = 0;
                if (!sys)
                {
                    pid = s.GetProcessID;
                    Info(pid, out name, out exe);
                }
                string key = sys ? "system" : (exe.Length > 0 ? exe : name);
                float peak = 0;
                try { peak = s.AudioMeterInformation.MasterPeakValue; } catch { }
                bool active = s.State == AudioSessionState.AudioSessionStateActive;
                if (!map.TryGetValue(key, out var g))
                {
                    g = new Group { Key = key, Name = name, Exe = exe, Vol = s.SimpleAudioVolume.Volume, Mute = s.SimpleAudioVolume.Mute };
                    map[key] = g;
                }
                if (pid != 0 && !g.ProcessIds.Contains(pid)) g.ProcessIds.Add(pid);
                g.Peak = Math.Max(g.Peak, peak);
                g.Active |= active;
                g.Sessions.Add(s);
            }

            catch { }
        }
        return map.Values.ToList();
    }

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr handle, int command);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr handle);

    // Nama ramah dan lokasi exe dari id proses (di-cache)
    static void Info(uint pid, out string name, out string exe)
    {
        if (procs.TryGetValue(pid, out var c)) { name = c.Name; exe = c.Exe; return; }
        name = "Aplikasi";
        exe = "";
        try
        {
            using var p = Process.GetProcessById((int)pid);
            name = p.ProcessName;
            try { exe = p.MainModule?.FileName ?? ""; } catch { }
            if (exe.Length > 0)
            {
                try
                {
                    var d = FileVersionInfo.GetVersionInfo(exe).FileDescription;
                    if (!string.IsNullOrWhiteSpace(d)) name = d.Trim();
                }
                catch { }
            }
        }
        catch { }
        if (procs.Count > 300) procs.Clear();
        procs[pid] = (name, exe);
    }
}
