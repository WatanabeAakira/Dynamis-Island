using System.Collections.ObjectModel;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

internal sealed record ClipboardEntry(string Id, string Kind, string Text, string? Path, DateTime CapturedAt, bool Pinned);
internal sealed record QuickNote(string Id, string Title, string Content, DateTime CreatedAt, DateTime ModifiedAt, bool Pinned);

// Fitur companion pakai JSON lokal dan listener WM_CLIPBOARDUPDATE. Konten tetap di perangkat.
internal sealed class DesktopCompanion : IDisposable
{
    private readonly Action<object> send;
    private readonly string root;
    private readonly string historyPath;
    private readonly string notesPath;
    private readonly object gate = new();
    private readonly List<ClipboardEntry> history;
    private readonly List<QuickNote> notes;
    private HwndSource? source;
    private Thread? listenerThread;
    private volatile bool enabled = true;
    private volatile bool capture = true;
    private int maxItems = 200;
    private string lastSignature = "";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    [DllImport("user32.dll", SetLastError = true)] private static extern bool AddClipboardFormatListener(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);
    private const int WmClipboardUpdate = 0x031D;

    public DesktopCompanion(Action<object> send, string dataDirectory)
    {
        this.send = send; root = Path.Combine(dataDirectory, "desktop-companion"); Directory.CreateDirectory(root);
        historyPath = Path.Combine(root, "clipboard-history.json"); notesPath = Path.Combine(root, "quick-notes.json");
        history = Read<ClipboardEntry>(historyPath); notes = Read<QuickNote>(notesPath);
    }

    private static List<T> Read<T>(string path) { try { return JsonSerializer.Deserialize<List<T>>(File.ReadAllText(path), Json) ?? new(); } catch { return new(); } }
    private void Persist<T>(string path, List<T> data) { var tmp = path + ".tmp"; File.WriteAllText(tmp, JsonSerializer.Serialize(data, Json)); File.Move(tmp, path, true); }
    public void Start()
    {
        if (listenerThread != null) return;
        listenerThread = new Thread(() => {
            try {
                var parameters = new HwndSourceParameters("DynamisClipboardListener") { Width = 0, Height = 0, WindowStyle = unchecked((int)0x80000000) };
                source = new HwndSource(parameters); source.AddHook(WndProc); AddClipboardFormatListener(source.Handle);
                Dispatcher.Run();
            } catch (Exception ex) { send(new { type = "companion-error", feature = "clipboard", message = ex.Message }); }
            finally { try { if(source!=null){RemoveClipboardFormatListener(source.Handle);source.Dispose();source=null;} } catch{} }
        }) { IsBackground = true, Name = "Dynamis Clipboard Listener" };
        listenerThread.SetApartmentState(ApartmentState.STA); listenerThread.Start();
    }
    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) { if (msg == WmClipboardUpdate) { handled = true; CaptureClipboard(); } return IntPtr.Zero; }
    public void Configure(JsonElement config)
    {
        if (config.TryGetProperty("enabled", out var e)) enabled = e.GetBoolean();
        if (config.TryGetProperty("capture", out var c)) capture = c.GetBoolean();
        if (config.TryGetProperty("maxItems", out var m)) maxItems = Math.Clamp(m.GetInt32(), 50, 500);
    }
    private void CaptureClipboard()
    {
        if (!enabled || !capture) return;
        try {
            string kind, text = ""; string? path = null;
            if (System.Windows.Clipboard.ContainsFileDropList()) { var files = System.Windows.Clipboard.GetFileDropList(); if (files.Count == 0) return; path = string.Join("\n", files.Cast<string>().Take(50)); text = string.Join("\n", files.Cast<string>().Take(50)); kind = "files"; }
            else if (System.Windows.Clipboard.ContainsImage()) { var image = System.Windows.Clipboard.GetImage(); if (image == null) return; var folder=Path.Combine(root,"images"); Directory.CreateDirectory(folder); path=Path.Combine(folder,Guid.NewGuid()+".png"); var encoder=new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image)); using(var output=File.Create(path)) encoder.Save(output); text=$"{image.PixelWidth} × {image.PixelHeight}"; kind="images"; }
            else if (System.Windows.Clipboard.ContainsText()) { text = System.Windows.Clipboard.GetText(); if (string.IsNullOrWhiteSpace(text) || text.Length > 1_000_000) return; kind = Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == "http" || uri.Scheme == "https") ? "links" : "text"; }
            else return;
            var signature = kind + "\n" + text + "\n" + path;
            lock (gate) { if (signature == lastSignature) return; lastSignature = signature; history.Insert(0, new(Guid.NewGuid().ToString("N"), kind, text, path, DateTime.UtcNow, false)); TrimAndSave(); }
            PublishHistory();
        } catch (Exception ex) { send(new { type = "companion-error", feature = "clipboard", message = ex.Message }); }
    }
    private void TrimAndSave() { var remove = history.Where(x => !x.Pinned).Skip(maxItems).Select(x => x.Id).ToHashSet(); history.RemoveAll(x => remove.Contains(x.Id)); Persist(historyPath, history); }
    public void Handle(JsonElement r)
    {
        var cmd = r.TryGetProperty("cmd", out var c) ? c.GetString() : "";
        lock (gate) {
            switch (cmd) {
                case "companion-init": PublishHistory(); PublishNotes(); return;
                case "clipboard-config": Configure(r); if (r.TryGetProperty("maxItems", out _)) TrimAndSave(); send(new { type="clipboard-history", items=history }); return;
                case "clipboard-delete": history.RemoveAll(x => x.Id == Str(r,"id")); Persist(historyPath,history); PublishHistory(); return;
                case "clipboard-copy": { var item=history.FirstOrDefault(x=>x.Id==Str(r,"id")); if(item!=null) source?.Dispatcher.Invoke(() => { if(item.Kind is "text" or "links") System.Windows.Clipboard.SetText(item.Text); else if(item.Path is string file) { if(item.Kind=="images" && File.Exists(file)) { var image=BitmapFrame.Create(new Uri(file)); System.Windows.Clipboard.SetImage(image); } else if(item.Kind=="files") { var files=new System.Collections.Specialized.StringCollection(); foreach(var f in file.Split('\n').Take(50)) if(File.Exists(f)) files.Add(f); if(files.Count>0) System.Windows.Clipboard.SetFileDropList(files); } } }); send(new {type="clipboard-action", action="copy", ok=item!=null}); return; }
                case "clipboard-open": { var item=history.FirstOrDefault(x=>x.Id==Str(r,"id")); var target=item?.Kind=="links" ? item.Text : item?.Path?.Split('\n').FirstOrDefault(); if(Uri.TryCreate(target,UriKind.Absolute,out var uri) && uri.Scheme is "http" or "https") Process.Start(new ProcessStartInfo(uri.ToString()){UseShellExecute=true}); else if(target!=null && File.Exists(target)) Process.Start(new ProcessStartInfo(target){UseShellExecute=true}); return; }
                case "clipboard-pin": { var i=history.FindIndex(x=>x.Id==Str(r,"id")); if(i>=0) history[i]=history[i] with { Pinned = !history[i].Pinned }; Persist(historyPath,history); PublishHistory(); return; }
                case "clipboard-clear": history.RemoveAll(x=>!x.Pinned); Persist(historyPath,history); PublishHistory(); return;
                case "notes-save": SaveNote(r); return;
                case "notes-create": { var now=DateTime.UtcNow; notes.Insert(0,new(Guid.NewGuid().ToString("N"),"","",now,now,false)); Persist(notesPath,notes); PublishNotes(); return; }
                case "notes-delete": notes.RemoveAll(x=>x.Id==Str(r,"id")); Persist(notesPath,notes); PublishNotes(); return;
                case "notes-pin": { var i=notes.FindIndex(x=>x.Id==Str(r,"id")); if(i>=0) notes[i]=notes[i] with {Pinned=!notes[i].Pinned,ModifiedAt=DateTime.UtcNow}; Persist(notesPath,notes); PublishNotes(); return; }
            }
        }
    }
    private void SaveNote(JsonElement r)
    {
        var id=Str(r,"id"); var title=Str(r,"title"); var content=Str(r,"content"); if(title.Length>200 || content.Length>2_000_000) return;
        var i=notes.FindIndex(x=>x.Id==id); var now=DateTime.UtcNow;
        if(i<0) notes.Insert(0,new(Guid.NewGuid().ToString("N"),title,content,now,now,false)); else notes[i]=notes[i] with {Title=title,Content=content,ModifiedAt=now};
        Persist(notesPath,notes); PublishNotes();
    }
    private static string Str(JsonElement r,string key) => r.TryGetProperty(key,out var v) ? v.GetString() ?? "" : "";
    private void PublishHistory() => send(new { type="clipboard-history", items=history.ToArray() });
    private void PublishNotes() => send(new { type="quick-notes", items=notes.ToArray() });
    public void Dispose() { try { var dispatcher=source?.Dispatcher;if(dispatcher!=null)dispatcher.BeginInvokeShutdown(DispatcherPriority.Send);listenerThread?.Join(1500); } catch { } }
}
