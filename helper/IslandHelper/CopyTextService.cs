using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

internal sealed class CopyTextService
{
    private const int HotkeyId = 0x4B10;
    private const int TranslateHotkeyId = 0x4B11;
    private const int MaxTranslationCharacters = 10000;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint WmHotkey = 0x0312;

    private readonly Action<object> send;
    private readonly object gate = new();
    private Thread? hotkeyThread;
    private Dispatcher? wpfDispatcher;
    private HwndSource? hwndSource;
    private IntPtr hotkeyWindow;
    private bool hotkeyRegistered;
    private bool translateHotkeyRegistered;
    private bool busy;
    private bool enabled = true;
    private string? languageTag;
    private string lastText = "";

    public CopyTextService(Action<object> send)
    {
        this.send = send;
    }

    public void Configure(bool enable, string? languageTag)
    {
        enabled = enable;
        this.languageTag = string.IsNullOrWhiteSpace(languageTag) ? null : languageTag.Trim();
        if (enabled && hotkeyThread == null) StartHotkey();
        if (!enabled) StopHotkey();
        SendLanguagesStatus();
    }

    public void StartSelection()
    {
        if (!enabled)
        {
            send(new { type = "copy-text-status", status = "OCR Failed", ok = false, error = "Copy Text is disabled in settings." });
            return;
        }
        StartOverlay();
    }

    public void StartTranslationSelection()
    {
        send(new { type = "translate-open" });
        StartOverlay(translationMode: true);
    }

    public async Task TranslateImageAsync(string path)
    {
        lock (gate)
        {
            if (busy)
            {
                SendTranslateStatus("Busy", false, "Wait for the current screen selection or OCR to finish.");
                return;
            }
            busy = true;
        }

        try
        {
            SendTranslateStatus("Extracting Text", true);
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new InvalidOperationException("The selected image could not be opened.");
            if (new FileInfo(path).Length > 20 * 1024 * 1024) throw new InvalidOperationException("Image is too large. Choose an image under 20 MB.");
            var extension = Path.GetExtension(path).ToLowerInvariant();
            if (extension is not (".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" or ".tif" or ".tiff"))
                throw new InvalidOperationException("This image format is not supported.");

            var file = await StorageFile.GetFileFromPathAsync(path);
            using var stream = await file.OpenAsync(FileAccessMode.Read);
            var decoder = await BitmapDecoder.CreateAsync(stream);
            if (decoder.PixelWidth == 0 || decoder.PixelHeight == 0 || decoder.PixelWidth > 12000 || decoder.PixelHeight > 12000)
                throw new InvalidOperationException("Image dimensions are not supported.");
            using var bitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
            var text = await RecognizeTextAsync(bitmap, null);
            PublishTranslationText(text, "image");
        }
        catch (Exception ex)
        {
            SendTranslateStatus("Translation Failed", false, ex.Message);
        }
        finally
        {
            lock (gate) { busy = false; }
        }
    }

    public void Start()
    {
        StartHotkey();
        SendLanguagesStatus();
    }

    public async Task CopyLastResultAsync()
    {
        if (string.IsNullOrWhiteSpace(lastText)) return;
        try
        {
            await ClipboardTask(lastText);
            send(new { type = "copy-text-status", status = "Text Copied Successfully", ok = true, processing = false, text = lastText, characterCount = lastText.Length });
        }
        catch (Exception ex)
        {
            send(new { type = "copy-text-status", status = "OCR Failed", ok = false, processing = false, error = ex.Message });
        }
    }

    public void Stop() => StopHotkey();

    private void SendLanguagesStatus()
    {
        var languages = OcrEngine.AvailableRecognizerLanguages
            .Select(x => new { tag = x.LanguageTag, displayName = x.DisplayName })
            .ToArray();
        send(new
        {
            type = "copy-text-languages",
            enabled,
            languages,
            selectedLanguage = languageTag
        });
        if (!string.IsNullOrWhiteSpace(lastText))
        {
            send(new { type = "copy-text-status", status = "Text Copied Successfully", ok = true, processing = false, text = lastText, characterCount = lastText.Length });
        }
    }

    private void StartHotkey()
    {
        lock (gate)
        {
            if (hotkeyThread != null)
            {
                if (hotkeyThread.IsAlive) RegisterHotkey();
                else send(new { type = "copy-text-status", status = "OCR Failed", ok = false, error = "The native OCR dispatcher has stopped. Restart Dynamis Island to restore screen selection." });
                return;
            }
            hotkeyThread = new Thread(RunHotkeyWindow)
            {
                IsBackground = true,
                Name = "CopyTextHotkey"
            };
            hotkeyThread.SetApartmentState(ApartmentState.STA);
            hotkeyThread.Start();
        }
    }

    private void StopHotkey()
    {
        lock (gate)
        {
            if (hotkeyWindow != IntPtr.Zero && hotkeyRegistered)
            {
                UnregisterHotKey(hotkeyWindow, HotkeyId);
                hotkeyRegistered = false;
            }
            if (hotkeyWindow != IntPtr.Zero && translateHotkeyRegistered)
            {
                UnregisterHotKey(hotkeyWindow, TranslateHotkeyId);
                translateHotkeyRegistered = false;
            }
        }
    }

    private void RegisterHotkey()
    {
        if (hotkeyWindow == IntPtr.Zero) return;
        if (enabled && !hotkeyRegistered)
        {
            hotkeyRegistered = RegisterHotKey(hotkeyWindow, HotkeyId, ModAlt | ModControl, 0x54);
            if (!hotkeyRegistered)
            {
                send(new { type = "copy-text-status", status = "OCR Failed", ok = false, error = "Ctrl+Alt+T is unavailable because another application may already use it." });
            }
        }
        if (!translateHotkeyRegistered)
        {
            translateHotkeyRegistered = RegisterHotKey(hotkeyWindow, TranslateHotkeyId, ModAlt | ModControl, 0x59);
            if (!translateHotkeyRegistered)
            {
                send(new { type = "translate-status", status = "Shortcut Unavailable", processing = false, error = "Ctrl+Alt+Y is unavailable because another application may already use it." });
            }
        }
    }

    private void RunHotkeyWindow()
    {
        wpfDispatcher = Dispatcher.CurrentDispatcher;
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var window = new Window
        {
            Width = 1,
            Height = 1,
            Left = -10000,
            Top = -10000,
            ShowInTaskbar = false,
            WindowStyle = WindowStyle.None,
            Opacity = 0,
            ShowActivated = false
        };
        window.SourceInitialized += (_, _) =>
        {
            hotkeyWindow = new WindowInteropHelper(window).Handle;
            hwndSource = HwndSource.FromHwnd(hotkeyWindow);
            hwndSource?.AddHook(WndProc);
            lock (gate) RegisterHotkey();
        };
        window.Closed += (_, _) =>
        {
            StopHotkey();
            hwndSource?.Dispose();
            hwndSource = null;
            hotkeyWindow = IntPtr.Zero;
            app.Shutdown();
        };
        window.Show();
        app.Run();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WmHotkey && wParam.ToInt32() == HotkeyId)
        {
            handled = true;
            StartSelection();
        }
        else if (msg == WmHotkey && wParam.ToInt32() == TranslateHotkeyId)
        {
            handled = true;
            StartTranslationSelection();
        }
        return IntPtr.Zero;
    }

    private void StartOverlay(bool translationMode = false)
    {
        Dispatcher? dispatcher;
        lock (gate)
        {
            if (busy)
            {
                if (translationMode) SendTranslateStatus("Busy", false, "Wait for the current screen selection or OCR to finish.");
                else send(new { type = "copy-text-status", status = "Busy", ok = false, processing = false, error = "Wait for the current screen selection or OCR to finish." });
                return;
            }
            busy = true;
            dispatcher = wpfDispatcher;
        }
        if (translationMode) SendTranslateStatus("Select an Area", true);
        else send(new { type = "copy-text-status", status = "Select an Area", ok = true, processing = true });

        if (dispatcher == null || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
        {
            CancelOverlay(translationMode);
            return;
        }

        try
        {
            dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    var selected = new Action<NativeRect>((rect) => _ = ProcessSelectionAsync(rect, translationMode));
                    var cancelled = new Action(() => CancelOverlay(translationMode));
                    var window = new SelectionOverlay(selected, cancelled);
                    window.Show();
                    window.Activate();
                }
                catch (Exception ex)
                {
                    CancelOverlay(translationMode);
                    if (translationMode) SendTranslateStatus("Translation Failed", false, ex.Message);
                    else send(new { type = "copy-text-status", status = "OCR Failed", ok = false, processing = false, error = ex.Message });
                }
            }));
        }
        catch (Exception ex)
        {
            CancelOverlay(translationMode);
            if (translationMode) SendTranslateStatus("Translation Failed", false, ex.Message);
            else send(new { type = "copy-text-status", status = "OCR Failed", ok = false, processing = false, error = ex.Message });
        }
    }

    private void CancelOverlay(bool translationMode)
    {
        if (translationMode) SendTranslateStatus("Ready to Translate", false);
        else OnCancelled();
        lock (gate) { busy = false; }
    }

    private void SendTranslateStatus(string status, bool processing, string? error = null)
    {
        send(new { type = "translate-status", status, processing, error });
    }

    private void PublishTranslationText(string text, string inputMode)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            SendTranslateStatus("No Text Detected", false, "No readable text was found. Try a clearer or larger area.");
            return;
        }
        var count = text.EnumerateRunes().Count();
        if (count > MaxTranslationCharacters)
        {
            SendTranslateStatus("Text Is Too Long", false, $"OCR found {count:N0} characters. Limit: {MaxTranslationCharacters:N0}. The text was not shortened.");
            return;
        }
        send(new { type = "translate-input", text, inputMode });
    }

    private void OnCancelled()
    {
        lock (gate) { busy = false; }
        send(new { type = "copy-text-status", status = "Ready to Extract Text", ok = true, processing = false });
    }

    private async Task ProcessSelectionAsync(NativeRect selection, bool translationMode = false)
    {
        try
        {
            if (translationMode) SendTranslateStatus("Capturing Screen", true);
            else send(new { type = "copy-text-status", status = "Capturing Screen", ok = true, processing = true });
            var pixelBytes = Capture(selection, out var width, out var height);
            if (pixelBytes == null || width <= 0 || height <= 0)
            {
                throw new InvalidOperationException("The selected screen area could not be captured.");
            }

            if (translationMode) SendTranslateStatus("Extracting Text", true);
            else send(new { type = "copy-text-status", status = "Recognizing Text", ok = true, processing = true });
            using var bitmap = new SoftwareBitmap(BitmapPixelFormat.Bgra8, width, height, BitmapAlphaMode.Premultiplied);
            bitmap.CopyFromBuffer(pixelBytes.AsBuffer());
            var text = await RecognizeTextAsync(bitmap, translationMode ? null : languageTag);
            if (translationMode)
            {
                PublishTranslationText(text, "screen");
                return;
            }
            if (string.IsNullOrWhiteSpace(text))
            {
                send(new { type = "copy-text-status", status = "No Text Detected", ok = false, processing = false });
            }
            else
            {
                lastText = text;
                send(new { type = "copy-text-status", status = "Copying to Clipboard", ok = true, processing = true });
                await ClipboardTask(text);
                send(new { type = "copy-text-status", status = "Text Copied Successfully", ok = true, processing = false, text, characterCount = text.Length });
            }
        }
        catch (Exception ex)
        {
            if (translationMode) SendTranslateStatus("Translation Failed", false, ex.Message);
            else send(new { type = "copy-text-status", status = "OCR Failed", ok = false, processing = false, error = ex.Message });
        }
        finally
        {
            lock (gate) { busy = false; }
        }
    }

    private static async Task<string> RecognizeTextAsync(SoftwareBitmap bitmap, string? preferredLanguageTag)
    {
        OcrEngine? engine = null;
        if (!string.IsNullOrWhiteSpace(preferredLanguageTag))
        {
            var language = new Language(preferredLanguageTag);
            if (OcrEngine.IsLanguageSupported(language)) engine = OcrEngine.TryCreateFromLanguage(language);
            if (engine == null) throw new InvalidOperationException($"OCR language '{preferredLanguageTag}' is unavailable. Install the corresponding Windows OCR language pack.");
        }
        else engine = OcrEngine.TryCreateFromUserProfileLanguages();

        if (engine == null) throw new InvalidOperationException("No supported Windows OCR language is installed. Install an OCR language pack in Windows settings.");
        var result = await engine.RecognizeAsync(bitmap);
        return string.Join("\n", result.Lines.Select(line => line.Text)).Trim();
    }

    private static Task ClipboardTask(string text)
    {
        var completion = new TaskCompletionSource();
        var thread = new Thread(() =>
        {
            try
            {
                System.Windows.Clipboard.SetText(text);
                completion.TrySetResult();
            }
            catch (Exception ex)
            {
                completion.TrySetException(ex);
            }
        })
        {
            IsBackground = true,
            Name = "CopyTextClipboard"
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }

    private static byte[]? Capture(NativeRect rect, out int width, out int height)
    {
        width = rect.Right - rect.Left;
        height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return null;

        var screenDc = GetDC(IntPtr.Zero);
        var memoryDc = CreateCompatibleDC(screenDc);
        var bitmap = CreateCompatibleBitmap(screenDc, width, height);
        var oldBitmap = SelectObject(memoryDc, bitmap);

        try
        {
            if (!BitBlt(memoryDc, 0, 0, width, height, screenDc, rect.Left, rect.Top, CaptureCombine)) return null;
            // GetDIBits requires the bitmap to be deselected from every device context.
            SelectObject(memoryDc, oldBitmap);
            var bmi = new BitmapInfoHeader
            {
                Size = (uint)Marshal.SizeOf<BitmapInfoHeader>(),
                Width = width,
                Height = -height,
                Planes = 1,
                BitCount = 32,
                Compression = 0
            };
            var bytes = new byte[checked(width * height * 4)];
            var result = GetDIBits(screenDc, bitmap, 0, (uint)height, bytes, ref bmi, 0);
            if (result == 0) return null;
            // The unused alpha byte from a BI_RGB 32-bit DIB is often zero. Make the
            // captured pixels opaque before handing them to the premultiplied bitmap.
            for (var i = 3; i < bytes.Length; i += 4) bytes[i] = byte.MaxValue;
            return bytes;
        }
        finally
        {
            SelectObject(memoryDc, oldBitmap);
            DeleteObject(bitmap);
            DeleteDC(memoryDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    private sealed class SelectionOverlay : Window
    {
        private readonly Action<NativeRect> selected;
        private readonly Action cancelled;
        private readonly Canvas canvas = new();
        private readonly Border selection = new();
        private readonly TextBlock dimensions = new();
        private bool dragging;
        private bool completed;
        private NativePoint start;
        private System.Windows.Point startDip;

        public SelectionOverlay(Action<NativeRect> selected, Action cancelled)
        {
            this.selected = selected;
            this.cancelled = cancelled;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            Topmost = true;
            AllowsTransparency = true;
            Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(70, 0, 0, 0));
            Left = SystemParameters.VirtualScreenLeft;
            Top = SystemParameters.VirtualScreenTop;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;
            Cursor = Cursors.Cross;

            selection.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(139, 155, 255));
            selection.BorderThickness = new Thickness(2);
            selection.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(20, 139, 155, 255));
            selection.Visibility = Visibility.Collapsed;
            canvas.Children.Add(selection);

            dimensions.Foreground = System.Windows.Media.Brushes.White;
            dimensions.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(210, 20, 20, 20));
            dimensions.Padding = new Thickness(6, 3, 6, 3);
            dimensions.FontSize = 12;
            dimensions.Visibility = Visibility.Collapsed;
            canvas.Children.Add(dimensions);

            Content = canvas;
            MouseLeftButtonDown += OnDown;
            MouseMove += OnMove;
            MouseLeftButtonUp += OnUp;
            KeyDown += (_, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    Cancel();
                }
            };
            Closed += (_, _) =>
            {
                if (!completed) cancelled();
            };
        }

        protected override void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);
            Keyboard.Focus(this);
        }

        private void OnDown(object sender, MouseButtonEventArgs e)
        {
            dragging = true;
            start = GetCursorPhysicalPoint();
            startDip = e.GetPosition(canvas);
            CaptureMouse();
            selection.Visibility = Visibility.Visible;
            dimensions.Visibility = Visibility.Visible;
            UpdateSelection();
        }

        private void OnMove(object sender, MouseEventArgs e)
        {
            if (dragging) UpdateSelection();
        }

        private void OnUp(object sender, MouseButtonEventArgs e)
        {
            if (!dragging) return;
            dragging = false;
            ReleaseMouseCapture();
            var end = GetCursorPhysicalPoint();
            var rect = Normalize(start, end);
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            if (width >= 2 && height >= 2)
            {
                completed = true;
                selected(rect);
                Close();
            }
            else
            {
                Cancel();
            }
        }

        private void Cancel()
        {
            if (completed) return;
            completed = true;
            cancelled();
            Close();
        }

        private void UpdateSelection()
        {
            var end = GetCursorPhysicalPoint();
            var rect = Normalize(start, end);
            var current = System.Windows.Input.Mouse.GetPosition(canvas);
            var x = Math.Min(startDip.X, current.X);
            var y = Math.Min(startDip.Y, current.Y);
            var w = Math.Abs(current.X - startDip.X);
            var h = Math.Abs(current.Y - startDip.Y);
            Canvas.SetLeft(selection, x);
            Canvas.SetTop(selection, y);
            selection.Width = w;
            selection.Height = h;

            dimensions.Text = $"{rect.Right - rect.Left} x {rect.Bottom - rect.Top}";
            Canvas.SetLeft(dimensions, Math.Max(0, x + w - dimensions.ActualWidth - 8));
            Canvas.SetTop(dimensions, Math.Max(0, y + h + 8));
            Canvas.SetZIndex(dimensions, 2);
        }

        private static NativePoint GetCursorPhysicalPoint()
        {
            GetCursorPos(out var point);
            return new NativePoint(point.X, point.Y);
        }

        private static NativeRect Normalize(NativePoint a, NativePoint b)
        {
            return new NativeRect
            {
                Left = Math.Min(a.X, b.X),
                Top = Math.Min(a.Y, b.Y),
                Right = Math.Max(a.X, b.X),
                Bottom = Math.Max(a.Y, b.Y)
            };
        }
    }

    private readonly record struct NativePoint(int X, int Y);
    private readonly record struct NativeRect(int Left, int Top, int Right, int Bottom);

    [StructLayout(LayoutKind.Sequential)]
    private struct WinPoint { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfoHeader
    {
        public uint Size;
        public int Width;
        public int Height;
        public ushort Planes;
        public ushort BitCount;
        public uint Compression;
        public uint SizeImage;
        public int XPelsPerMeter;
        public int YPelsPerMeter;
        public uint ClrUsed;
        public uint ClrImportant;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out WinPoint point);
    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int width, int height);
    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr hdc, IntPtr objectHandle);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr objectHandle);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")]
    private static extern int GetDIBits(IntPtr hdc, IntPtr bitmap, uint startScan, uint scanLines, byte[] pixels, ref BitmapInfoHeader bmi, uint usage);
    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern bool BitBlt(IntPtr dest, int x, int y, int width, int height, IntPtr src, int srcX, int srcY, uint operation);
    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
    private const uint CaptureCombine = 0x00CC0020;
}
