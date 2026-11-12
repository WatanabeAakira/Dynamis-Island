using System.Text.Json;
using Windows.Devices.Geolocation;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

// Helper Windows untuk island. Protokol: satu objek JSON per baris.
//   stdout -> {"type":"state", ...}   (status media, dikirim tiap 1 detik dan saat ada perubahan)
//   stdin  <- {"cmd":"toggle|play|pause|next|prev|seek|shuffle|repeat", "value":ms}
static class Program
{
    static GlobalSystemMediaTransportControlsSessionManager mgr = null!;
    static GlobalSystemMediaTransportControlsSession? session;
    static string selectedSessionId = "";
    static readonly SemaphoreSlim gate = new(1, 1);
    static readonly object outLock = new();
    static readonly JsonSerializerOptions json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    static string lastKey = "";
    static bool artSent;
    static int artTries;
    static bool wasActive = true;

    static string SessionId(GlobalSystemMediaTransportControlsSession s) => s.SourceAppUserModelId ?? "";

    static async Task Main()
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        mgr.CurrentSessionChanged += (_, _) => { Attach(); Fire(); };
        Attach();
        _ = Task.Run(ReadCommands);
        while (true)
        {
            await Publish();
            await Task.Delay(1000);
        }
    }

    internal static void Send(object o)
    {
        lock (outLock)
        {
            Console.Out.WriteLine(JsonSerializer.Serialize(o, json));
            Console.Out.Flush();
        }
    }

    static void Fire() => _ = Publish();
    static void OnProps(GlobalSystemMediaTransportControlsSession s, MediaPropertiesChangedEventArgs a) => Fire();
    static void OnPlayback(GlobalSystemMediaTransportControlsSession s, PlaybackInfoChangedEventArgs a) => Fire();
    static void OnTimeline(GlobalSystemMediaTransportControlsSession s, TimelinePropertiesChangedEventArgs a) => Fire();

    static void Attach()
    {
        var sessions = mgr.GetSessions();
        var next = string.IsNullOrEmpty(selectedSessionId)
            ? null
            : sessions.FirstOrDefault(x => SessionId(x) == selectedSessionId);
        next ??= mgr.GetCurrentSession();
        selectedSessionId = next == null ? "" : SessionId(next);
        if (session != null)
        {
            session.MediaPropertiesChanged -= OnProps;
            session.PlaybackInfoChanged -= OnPlayback;
            session.TimelinePropertiesChanged -= OnTimeline;
        }
        session = next;
        lastKey = "";
        artSent = false;
        artTries = 0;
        if (session != null)
        {
            session.MediaPropertiesChanged += OnProps;
            session.PlaybackInfoChanged += OnPlayback;
            session.TimelinePropertiesChanged += OnTimeline;
        }
    }

    static async Task Publish()
    {
        await gate.WaitAsync();
        try
        {
            var s = session;
            var sessionChoices = new List<object>();
            foreach (var candidate in mgr.GetSessions())
            {
                try
                {
                    var candidateProps = await candidate.TryGetMediaPropertiesAsync();
                    sessionChoices.Add(new
                    {
                        id = SessionId(candidate),
                        source = candidate.SourceAppUserModelId,
                        title = candidateProps.Title,
                        artist = candidateProps.Artist,
                        playing = candidate.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
                    });
                }
                catch { }
            }
            if (s == null)
            {
                if (wasActive || sessionChoices.Count > 0)
                    Send(new { type = "state", active = false, sessions = sessionChoices, selectedSessionId });
                wasActive = false;
                return;
            }
            wasActive = true;

            var props = await s.TryGetMediaPropertiesAsync();
            var pb = s.GetPlaybackInfo();
            var tl = s.GetTimelineProperties();

            var key = $"{s.SourceAppUserModelId}|{props.Title}|{props.Artist}|{props.AlbumTitle}";
            var newTrack = key != lastKey;
            if (newTrack) { lastKey = key; artSent = false; artTries = 0; }

            // Cover kadang telat tersedia, jadi dicoba beberapa kali. Dikirim sekali saja.
            string? thumb = null;
            if (!artSent && artTries < 6)
            {
                artTries++;
                thumb = await ReadThumb(props.Thumbnail);
                if (thumb != null) artSent = true;
            }

            var dur = (long)(tl.EndTime - tl.StartTime).TotalMilliseconds;
            var playing = pb.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            var rate = pb.PlaybackRate ?? 1.0;

            // Posisi saat ini = posisi terakhir yang dilaporkan + waktu berjalan sejak pembaruan itu.
            var pos = (tl.Position - tl.StartTime).TotalMilliseconds;
            if (playing)
            {
                var delta = (DateTimeOffset.UtcNow - tl.LastUpdatedTime).TotalMilliseconds;
                if (delta < 0 || delta > 6 * 3600 * 1000) delta = 0;
                pos += delta * rate;
            }
            pos = Math.Max(pos, 0);
            if (dur > 0) pos = Math.Min(pos, dur);

            Send(new
            {
                type = "state",
                active = true,
                sessionId = SessionId(s),
                selectedSessionId,
                sessions = sessionChoices,
                newTrack,
                title = props.Title,
                artist = props.Artist,
                album = props.AlbumTitle,
                source = s.SourceAppUserModelId,
                status = pb.PlaybackStatus.ToString(),
                positionMs = (long)pos,
                durationMs = dur,
                rate,
                shuffle = pb.IsShuffleActive ?? false,
                repeat = pb.AutoRepeatMode?.ToString() ?? "None",
                controls = new
                {
                    play = pb.Controls.IsPlayEnabled,
                    pause = pb.Controls.IsPauseEnabled,
                    next = pb.Controls.IsNextEnabled,
                    prev = pb.Controls.IsPreviousEnabled,
                    seek = pb.Controls.IsPlaybackPositionEnabled,
                    shuffle = pb.Controls.IsShuffleEnabled,
                    repeat = pb.Controls.IsRepeatEnabled
                },
                thumb
            });
        }
        catch { /* sesi bisa hilang di tengah jalan; siklus berikutnya akan memperbaiki */ }
        finally { gate.Release(); }
    }

    static async Task<string?> ReadThumb(IRandomAccessStreamReference? r)
    {
        if (r == null) return null;
        try
        {
            using var st = await r.OpenReadAsync();
            var size = (uint)st.Size;
            if (size == 0 || size > 8_000_000) return null;
            var buf = new byte[size];
            using var rd = new DataReader(st);
            await rd.LoadAsync(size);
            rd.ReadBytes(buf);
            var mime = string.IsNullOrEmpty(st.ContentType) ? "image/jpeg" : st.ContentType;
            return $"data:{mime};base64,{Convert.ToBase64String(buf)}";
        }
        catch { return null; }
    }

    // Lokasi Windows (butuh Layanan Lokasi menyala di Pengaturan Windows)
    static async Task Locate()
    {
        try
        {
            var access = await Geolocator.RequestAccessAsync();
            if (access != GeolocationAccessStatus.Allowed)
            {
                Send(new { type = "location", ok = false, reason = access.ToString() });
                return;
            }
            var geo = new Geolocator { DesiredAccuracyInMeters = 5000 };
            var pos = await geo.GetGeopositionAsync(TimeSpan.FromMinutes(10), TimeSpan.FromSeconds(8));
            var p = pos.Coordinate.Point.Position;
            Send(new { type = "location", ok = true, lat = p.Latitude, lon = p.Longitude, accuracy = pos.Coordinate.Accuracy });
        }
        catch (Exception ex)
        {
            Send(new { type = "location", ok = false, reason = ex.Message });
        }
    }

    static async Task ReadCommands()
    {
        string? line;
        while ((line = Console.In.ReadLine()) != null)
        {
            try { await Handle(line); } catch { }
        }
        Environment.Exit(0); // Electron menutup stdin -> helper ikut berhenti
    }

    static async Task Handle(string line)
    {
        using var doc = JsonDocument.Parse(line);
        var cmd = doc.RootElement.GetProperty("cmd").GetString();
        if (cmd == "location") { _ = Locate(); return; } // tidak butuh sesi media
        if (cmd != null && cmd.StartsWith("audio-")) { AudioControl.Handle(cmd, doc.RootElement); return; }
        if (cmd == "media-select-session")
        {
            selectedSessionId = doc.RootElement.TryGetProperty("sessionId", out var id) ? id.GetString() ?? "" : "";
            Attach();
            await Publish();
            return;
        }
        var s = session;
        if (s == null) return;

        switch (cmd)
        {
            case "toggle": await s.TryTogglePlayPauseAsync(); break;
            case "play":   await s.TryPlayAsync(); break;
            case "pause":  await s.TryPauseAsync(); break;
            case "next":   await s.TrySkipNextAsync(); break;
            case "prev":   await s.TrySkipPreviousAsync(); break;
            case "seek":
                var ms = doc.RootElement.GetProperty("value").GetInt64();
                await s.TryChangePlaybackPositionAsync(ms * 10000); // satuan 100 ns
                break;
            case "shuffle":
                var cur = s.GetPlaybackInfo().IsShuffleActive ?? false;
                await s.TryChangeShuffleActiveAsync(!cur);
                break;
            case "repeat":
                var m = s.GetPlaybackInfo().AutoRepeatMode ?? MediaPlaybackAutoRepeatMode.None;
                var nx = m switch
                {
                    MediaPlaybackAutoRepeatMode.None => MediaPlaybackAutoRepeatMode.List,
                    MediaPlaybackAutoRepeatMode.List => MediaPlaybackAutoRepeatMode.Track,
                    _ => MediaPlaybackAutoRepeatMode.None
                };
                await s.TryChangeAutoRepeatModeAsync(nx);
                break;
        }
        await Task.Delay(150);
        await Publish();
    }
}
