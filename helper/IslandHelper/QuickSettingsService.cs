using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Text.Json;
using Microsoft.Win32;
using Windows.Devices.Radios;
using Windows.Networking.Connectivity;
using Windows.System.Power;

internal sealed record QuickSettingsSnapshot(bool WifiConnected,string? WifiName,bool? BluetoothEnabled,string? BluetoothError,bool? BatterySaver,bool? DarkTheme,object? Microphone);

// Settings with reliable public APIs are changed here. Unsupported controls open Windows Settings.
internal sealed class QuickSettingsService : IDisposable
{
    private readonly Action<object> send;
    private bool started;
    private readonly List<Radio> radios=new();
    private RadioAccessStatus? radioAccess;
    private readonly SemaphoreSlim radioGate=new(1,1);
    public QuickSettingsService(Action<object> send){this.send=send;}
    public void Start(){if(started)return;started=true;NetworkChange.NetworkAddressChanged+=NetworkChanged;NetworkChange.NetworkAvailabilityChanged+=NetworkAvailabilityChanged;PowerManager.EnergySaverStatusChanged+=PowerChanged;}
    private void NetworkChanged(object? s,EventArgs e)=>_ = Publish();
    private void NetworkAvailabilityChanged(object? s,NetworkAvailabilityEventArgs e)=>_ = Publish();
    private void PowerChanged(object? s,object e)=>_ = Publish();
    private async Task WatchRadios(){await radioGate.WaitAsync();try{if(radios.Count>0||radioAccess.HasValue)return;radioAccess=await Radio.RequestAccessAsync();if(radioAccess!=RadioAccessStatus.Allowed)return;foreach(var radio in await Radio.GetRadiosAsync()){radio.StateChanged+=RadioChanged;radios.Add(radio);}}catch(Exception ex){send(new{type="quick-settings-error",message=ex.Message});}finally{radioGate.Release();}}
    private void RadioChanged(Radio radio,object args)=>_ = Publish();
    public async Task Handle(string cmd, JsonElement request)
    {
        try {
            if(cmd=="quick-settings-open") { OpenSettings(Get(request,"page")); return; }
            if(cmd=="quick-settings-refresh") { await WatchRadios(); await Publish(); return; }
            if(cmd=="quick-settings-bluetooth") { await WatchRadios(); await SetBluetooth(request.TryGetProperty("enabled",out var b)&&b.GetBoolean()); return; }
            if(cmd=="quick-settings-mic") { AudioControl.Handle("audio-micmute",request); await Publish(); return; }
        } catch(Exception ex){send(new {type="quick-settings-error",message=ex.Message});}
    }
    private async Task SetBluetooth(bool enabled)
    {
        if(radioAccess!=RadioAccessStatus.Allowed){send(new{type="quick-settings-error",message=$"Bluetooth control unavailable: {radioAccess?.ToString()??"access denied"}. Open Windows Settings to change it."});OpenSettings("bluetooth");return;}
        var radio=radios.FirstOrDefault(r=>r.Kind==RadioKind.Bluetooth);if(radio==null){send(new{type="quick-settings-error",message="Bluetooth radio is not available."});return;}
        var result=await radio.SetStateAsync(enabled?RadioState.On:RadioState.Off);if(result!=RadioAccessStatus.Allowed)send(new{type="quick-settings-error",message=$"Windows denied the Bluetooth change: {result}."});await Publish();
    }
    public Task Publish()
    {
        bool wifi=false;string? wifiName=null;try{var profile=NetworkInformation.GetInternetConnectionProfile();var isWifi=profile?.NetworkAdapter?.IanaInterfaceType==71;wifi=isWifi&&profile!.GetNetworkConnectivityLevel()!=NetworkConnectivityLevel.None&&NetworkInterface.GetAllNetworkInterfaces().Any(n=>n.NetworkInterfaceType==NetworkInterfaceType.Wireless80211&&n.OperationalStatus==OperationalStatus.Up);wifiName=wifi?profile?.ProfileName:null;}catch{}
        bool? bluetooth=null;string? bluetoothError=null;try{var radio=radios.FirstOrDefault(r=>r.Kind==RadioKind.Bluetooth);bluetooth=radio==null?null:radio.State==RadioState.On;if(radio==null&&radioAccess.HasValue&&radioAccess!=RadioAccessStatus.Allowed)bluetoothError=radioAccess.ToString();}catch(Exception ex){bluetoothError=ex.Message;}
        bool? saver=null;try{saver=PowerManager.EnergySaverStatus==EnergySaverStatus.On;}catch{}
        bool? dark=null;try{using var k=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");dark=Convert.ToInt32(k?.GetValue("AppsUseLightTheme",1))==0;}catch{}
        send(new{type="quick-settings-state",state=new QuickSettingsSnapshot(wifi,wifiName,bluetooth,bluetoothError,saver,dark,AudioControl.MicrophoneState())});
        return Task.CompletedTask;
    }
    public static void OpenSettings(string? page)
    {
        var uri=page switch{"wifi"=>"ms-settings:network-wifi","bluetooth"=>"ms-settings:bluetooth","airplane"=>"ms-settings:network-airplanemode","display"=>"ms-settings:display","nightlight"=>"ms-settings:nightlight","theme"=>"ms-settings:colors","dnd"=>"ms-settings:notifications","battery"=>"ms-settings:batterysaver","sound"=>"ms-settings:sound","power"=>"ms-settings:powersleep",_=>"ms-settings:"};
        Process.Start(new ProcessStartInfo(uri){UseShellExecute=true});
    }
    private static string? Get(JsonElement e,string key)=>e.TryGetProperty(key,out var v)?v.GetString():null;
    public void Dispose(){if(!started)return;NetworkChange.NetworkAddressChanged-=NetworkChanged;NetworkChange.NetworkAvailabilityChanged-=NetworkAvailabilityChanged;PowerManager.EnergySaverStatusChanged-=PowerChanged;foreach(var radio in radios)radio.StateChanged-=RadioChanged;radios.Clear();started=false;}
}
