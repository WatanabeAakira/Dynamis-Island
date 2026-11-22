using System.Diagnostics;
using System.IO;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.Json;

internal sealed record ProcessMetric(int Pid, string Name, double Cpu, long MemoryBytes);
internal sealed record SystemSnapshot(DateTime TimestampUtc, double? CpuPercent, double? MemoryPercent, long MemoryUsedBytes, long MemoryTotalBytes, double? DiskPercent, long DiskUsedBytes, long DiskTotalBytes, double? DownloadBytesPerSecond, double? UploadBytesPerSecond, double? GpuPercent, long? GpuMemoryUsedBytes, long? GpuMemoryTotalBytes, double? CpuTemperatureCelsius, double? GpuTemperatureCelsius, IReadOnlyList<ProcessMetric> TopProcesses, string? Error = null);

// Single adaptive sampler. One snapshot feeds cards, graphs, alerts, and compact UI.
internal sealed class SystemMonitorService : IDisposable
{
    [StructLayout(LayoutKind.Sequential)] private struct FileTime { public uint Low; public uint High; public long Value => ((long)High << 32) | Low; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)] private class MemoryStatus { public uint Length=(uint)Marshal.SizeOf<MemoryStatus>(); public uint Load; public ulong Total; public ulong Available; public ulong PageFile; public ulong PageFileAvailable; public ulong Virtual; public ulong VirtualAvailable; public ulong Extended; }
    [DllImport("kernel32.dll", SetLastError=true)] private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)] private static extern bool GlobalMemoryStatusEx([In, Out] MemoryStatus status);

    private readonly Action<object> send;
    private readonly object gate=new();
    private readonly SemaphoreSlim wake=new(0,1);
    private readonly Dictionary<int,(TimeSpan Cpu, DateTime At)> previousProcesses=new();
    private CancellationTokenSource? loopCts;
    private string mode="hidden", activeTab="";
    private int intervalMs=1000, processCount=5;
    private bool alertsEnabled;
    private bool monitorCpu=true,monitorMemory=true,monitorDisk=true,monitorNetwork=true,monitorProcesses=true;
    private string compactMetric="cpu";
    private double ramThreshold=90, cpuThreshold=95;
    private string sort="cpu";
    private DateTime previousAt;
    private DateTime lastSampleAt=DateTime.MinValue;
    private long previousIdle, previousTotal, previousReceived, previousSent;
    private bool hasCpuBaseline,hasNetworkBaseline;
    private DateTime lastMemoryAt=DateTime.MinValue,lastDiskAt=DateTime.MinValue,lastProcessAt=DateTime.MinValue;
    private long cachedMemoryUsed,cachedMemoryTotal,cachedDiskUsed,cachedDiskTotal;
    private double? cachedMemoryPercent,cachedDiskPercent;
    private IReadOnlyList<ProcessMetric> cachedProcesses=Array.Empty<ProcessMetric>();
    private DateTime lastAlert=DateTime.MinValue;

    public SystemMonitorService(Action<object> send) { this.send=send; }
    public void Configure(JsonElement request)
    {
        lock(gate) {
            if(request.TryGetProperty("mode",out var m)) mode=m.GetString()??"hidden";
            if(request.TryGetProperty("activeTab",out var a)) activeTab=a.GetString()??"";
            if(request.TryGetProperty("intervalMs",out var i)) intervalMs=Math.Clamp(i.GetInt32(),500,10000);
            if(request.TryGetProperty("processCount",out var pc)) processCount=Math.Clamp(pc.GetInt32(),3,10);
            if(request.TryGetProperty("processMonitoring",out var pm)) monitorProcesses=pm.GetBoolean();
            if(request.TryGetProperty("sort",out var so)) sort=so.GetString()=="memory"?"memory":"cpu";
            if(request.TryGetProperty("alertsEnabled",out var ae)) alertsEnabled=ae.GetBoolean();
            if(request.TryGetProperty("ramThreshold",out var rt)) ramThreshold=Math.Clamp(rt.GetDouble(),50,99);
            if(request.TryGetProperty("cpuThreshold",out var ct)) cpuThreshold=Math.Clamp(ct.GetDouble(),50,100);
            if(request.TryGetProperty("compactMetric",out var cm)) compactMetric=cm.GetString()=="ram"?"ram":"cpu";
            if(request.TryGetProperty("metrics",out var metrics)&&metrics.ValueKind==JsonValueKind.Object){var networkWasEnabled=monitorNetwork;monitorCpu=Metric(metrics,"cpu",true);monitorMemory=Metric(metrics,"ram",true);monitorDisk=Metric(metrics,"disk",true);monitorNetwork=Metric(metrics,"network",true);monitorProcesses=Metric(metrics,"processes",monitorProcesses);if(networkWasEnabled!=monitorNetwork)hasNetworkBaseline=false;}
            if(loopCts==null || loopCts.IsCancellationRequested) { hasCpuBaseline=false;hasNetworkBaseline=false;lastSampleAt=DateTime.MinValue;lastMemoryAt=DateTime.MinValue;lastDiskAt=DateTime.MinValue;lastProcessAt=DateTime.MinValue;previousProcesses.Clear();loopCts=new CancellationTokenSource(); _=Run(loopCts.Token); }
            else if(wake.CurrentCount==0) wake.Release();
        }
    }
    private int DelayMs() { lock(gate) { if(mode=="expanded" && activeTab=="system-monitor") return intervalMs; if(mode=="hover") return Math.Max(2000,intervalMs); if(mode=="compact") return 10000; return alertsEnabled?5000:30000; } }
    private async Task Run(CancellationToken token)
    {
        while(!token.IsCancellationRequested) {
            try {
                var snapshot=await Task.Run(Sample,token);
                send(new { type="system-monitor-snapshot", snapshot });
                CheckAlerts(snapshot);
            } catch(OperationCanceledException) { break; } catch(Exception ex) { send(new {type="system-monitor-error",message=ex.Message}); }
            lock(gate) if((mode=="hidden" || activeTab!="system-monitor") && !alertsEnabled) { loopCts?.Dispose(); loopCts=null; break; }
            using var waitCts=CancellationTokenSource.CreateLinkedTokenSource(token);
            var delay=Task.Delay(DelayMs(),waitCts.Token);var signal=wake.WaitAsync(waitCts.Token);
            try { await Task.WhenAny(delay,signal);waitCts.Cancel();await Task.WhenAll(delay,signal); } catch(OperationCanceledException) { if(token.IsCancellationRequested)break; }
        }
    }
    private SystemSnapshot Sample()
    {
        bool expanded,needCpu,needMemory,needDisk,needNetwork,needProcesses; lock(gate){expanded=mode=="expanded"&&activeTab=="system-monitor";needCpu=(expanded||mode=="hover")&&monitorCpu||(mode=="compact"&&compactMetric=="cpu"&&monitorCpu)||alertsEnabled;needMemory=((expanded||mode=="hover")&&monitorMemory)||(mode=="compact"&&compactMetric=="ram"&&monitorMemory)||alertsEnabled;needDisk=expanded&&monitorDisk;needNetwork=expanded&&monitorNetwork;needProcesses=expanded&&monitorProcesses;}
        var now=DateTime.UtcNow;if(lastSampleAt!=DateTime.MinValue&&(now-lastSampleAt).TotalSeconds>15){hasCpuBaseline=false;hasNetworkBaseline=false;previousProcesses.Clear();lastMemoryAt=DateTime.MinValue;lastDiskAt=DateTime.MinValue;lastProcessAt=DateTime.MinValue;}lastSampleAt=now;
        double? cpu=null, down=null, up=null; long idle=0,total=0,received=0,sentBytes=0;
        if(needCpu) try { if(GetSystemTimes(out var it,out var kt,out var ut)) { idle=it.Value; total=kt.Value+ut.Value; if(hasCpuBaseline) { var dt=total-previousTotal; if(dt>0) cpu=Math.Clamp(100.0*(1.0-(idle-previousIdle)/(double)dt),0,100); } } } catch { }
        if(needNetwork) try { foreach(var n in NetworkInterface.GetAllNetworkInterfaces()) { if(n.OperationalStatus!=OperationalStatus.Up || n.NetworkInterfaceType==NetworkInterfaceType.Loopback) continue; var s=n.GetIPv4Statistics(); received+=s.BytesReceived; sentBytes+=s.BytesSent; } if(hasNetworkBaseline) { var sec=Math.Max(.001,(now-previousAt).TotalSeconds); down=Math.Max(0,(received-previousReceived)/sec); up=Math.Max(0,(sentBytes-previousSent)/sec); } } catch { }
        if(needMemory && (now-lastMemoryAt).TotalSeconds>=2) try { var m=new MemoryStatus(); if(GlobalMemoryStatusEx(m)) { cachedMemoryTotal=(long)m.Total; cachedMemoryUsed=(long)(m.Total-m.Available); cachedMemoryPercent=m.Total>0?cachedMemoryUsed*100.0/cachedMemoryTotal:null; lastMemoryAt=now; } } catch { }
        if(needDisk && (now-lastDiskAt).TotalSeconds>=2) try { var drive=new DriveInfo(Path.GetPathRoot(Environment.SystemDirectory)!); if(drive.IsReady) { cachedDiskTotal=drive.TotalSize; cachedDiskUsed=drive.TotalSize-drive.AvailableFreeSpace; cachedDiskPercent=cachedDiskTotal>0?cachedDiskUsed*100.0/cachedDiskTotal:null; lastDiskAt=now; } } catch { }
        if(needProcesses && (now-lastProcessAt).TotalSeconds>=3) { cachedProcesses=SampleProcesses(now); lastProcessAt=now; }
        var processes=needProcesses?cachedProcesses:(IReadOnlyList<ProcessMetric>)Array.Empty<ProcessMetric>();
        if(needCpu){previousIdle=idle;previousTotal=total;hasCpuBaseline=total>0;}if(needNetwork){previousAt=now;previousReceived=received;previousSent=sentBytes;hasNetworkBaseline=true;}
        return new(now,cpu,needMemory?cachedMemoryPercent:null,needMemory?cachedMemoryUsed:0,needMemory?cachedMemoryTotal:0,needDisk?cachedDiskPercent:null,needDisk?cachedDiskUsed:0,needDisk?cachedDiskTotal:0,needNetwork?down:null,needNetwork?up:null,null,null,null,null,null,processes);
    }
    private static bool Metric(JsonElement metrics,string key,bool fallback)=>metrics.TryGetProperty(key,out var value)?value.ValueKind==JsonValueKind.True:fallback;
    private IReadOnlyList<ProcessMetric> SampleProcesses(DateTime now)
    {
        var list=new List<ProcessMetric>(); var next=new Dictionary<int,(TimeSpan Cpu,DateTime At)>();
        foreach(var p in Process.GetProcesses()) try { using(p) { var cpu=p.TotalProcessorTime; var ws=p.WorkingSet64; var current=(cpu,now); double usage=0; if(previousProcesses.TryGetValue(p.Id,out var prev)) { var elapsed=(now-prev.At).TotalSeconds; if(elapsed>.01) usage=Math.Clamp((cpu-prev.Cpu).TotalSeconds/elapsed/Environment.ProcessorCount*100,0,100); } next[p.Id]=current; list.Add(new(p.Id,p.ProcessName,usage,ws)); } } catch { }
        previousProcesses.Clear(); foreach(var item in next) previousProcesses[item.Key]=item.Value;
        int count; string order; lock(gate){count=processCount;order=sort;}
        return (order=="memory"?list.OrderByDescending(p=>p.MemoryBytes):list.OrderByDescending(p=>p.Cpu)).Take(count).ToArray();
    }
    private void CheckAlerts(SystemSnapshot s)
    {
        bool on; double cpuLimit,ramLimit; lock(gate){on=alertsEnabled;cpuLimit=cpuThreshold;ramLimit=ramThreshold;}
        if(!on || (DateTime.UtcNow-lastAlert).TotalMinutes<2) return;
        string? message=s.CpuPercent>=cpuLimit?$"CPU usage is {Math.Round(s.CpuPercent.Value)}%.":s.MemoryPercent>=ramLimit?$"Memory usage is {Math.Round(s.MemoryPercent.Value)}%.":null;
        if(message==null)return; lastAlert=DateTime.UtcNow; send(new {type="system-monitor-alert",title="High system usage",body=message});
    }
    public void Dispose() { lock(gate){loopCts?.Cancel();loopCts?.Dispose();loopCts=null;}wake.Dispose(); }
}
