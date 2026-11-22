using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
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

internal sealed class CopyTextService
{
    private const int HotkeyId = 0x4B10;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint WmHotkey = 0x0312;

    private readonly Action<object> send;
    private readonly object gate = new();
    private Thread? hotkeyThread;
    private HwndSource? hwndSource;
    private IntPtr hotkeyWindow;
    private bool busy;
    private bool enabled = true;
    private string? languageTag;

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

    public void Start()
    {
        StartHotkey();
        SendLanguagesStatus();
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
    }

    private void StartHotkey()
    {
        lock (gate)
        {
            if (hotkeyThread != null) return;
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
        IntPtr handle;
        lock (gate)
        {
            handle = hotkeyWindow;
            hotkeyThread = null;
        }
        if (handle != IntPtr.Zero)
        {
            UnregisterHotKey(handle, HotkeyId);
            hwndSource?.Dispose();
            hotkeyWindow = IntPtr.Zero;
        }
    }

    private void RunHotkeyWindow()
    {
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
            if (!RegisterHotKey(hotkeyWindow, HotkeyId, ModAlt | ModControl, 0x54))
            {
                send(new
                {
                    type = "copy-text-status",
                    status = "OCR Failed",
                    ok = false,
                    error = "Ctrl+Alt+T is unavailable because another application may already use it."
                });
            }
        };
        window.Closed += (_, _) =>
        {
            if (hotkeyWindow != IntPtr.Zero)
            {
                UnregisterHotKey(hotkeyWindow, HotkeyId);
                hotkeyWindow = IntPtr.Zero;
            }
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
        return IntPtr.Zero;
    }

    private void StartOverlay()
    {
        lock (gate)
        {
            if (busy) return;
            busy = true;
        }
        send(new { type = "copy-text-status", status = "Select an Area", ok = true, processing = true });

        var thread = new Thread(() =>
        {
            var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
            var window = new SelectionOverlay(OnSelected, OnCancelled);
            app.Run(window);
        })
        {
            IsBackground = true,
            Name = "CopyTextOverlay"
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }

    private void OnCancelled()
    {
        lock (gate) { busy = false; }
        send(new { type = "copy-text-status", status = "Ready to Extract Text", ok = true, processing = false });
    }

    private void OnSelected(NativeRect selection)
    {
        _ = ProcessSelectionAsync(selection);
    }

    private async Task ProcessSelectionAsync(NativeRect selection)
    {
        try
        {
            send(new { type = "copy-text-status", status = "Capturing Screen", ok = true, processing = true });
            var pixelBytes = Capture(selection, out var width, out var height);
            if (pixelBytes == null || width <= 0 || height <= 0)
            {
                throw new InvalidOperationException("The selected screen area could not be captured.");
            }

            send(new { type = "copy-text-status", status = "Recognizing Text", ok = true, processing = true });
            using var bitmap = new SoftwareBitmap(BitmapPixelFormat.Bgra8, width, height, BitmapAlphaMode.Premultiplied);
            bitmap.CopyFromBuffer(pixelBytes.AsBuffer());

            OcrEngine? engine = null;
            if (!string.IsNullOrWhiteSpace(languageTag))
            {
                var language = new Language(languageTag);
                if (OcrEngine.IsLanguageSupported(language)) engine = OcrEngine.TryCreateFromLanguage(language);
                if (engine == null) throw new InvalidOperationException($"OCR language '{languageTag}' is unavailable. Install the corresponding Windows OCR language pack.");
            }
            else
            {
                engine = OcrEngine.TryCreateFromUserProfileLanguages();
            }

            if (engine == null)
            {
                throw new InvalidOperationException("No supported Windows OCR language is installed. Install an OCR language pack in Windows settings.");
            }

            var result = await engine.RecognizeAsync(bitmap);
            var text = string.Join("\n", result.Lines.Select(line => line.Text)).Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                send(new { type = "copy-text-status", status = "No Text Detected", ok = false, processing = false });
            }
            else
            {
                send(new { type = "copy-text-status", status = "Copying to Clipboard", ok = true, processing = true });
                await ClipboardTask(text);
                send(new { type = "copy-text-status", status = "Text Copied Successfully", ok = true, processing = false });
            }
        }
        catch (Exception ex)
        {
            send(new { type = "copy-text-status", status = "OCR Failed", ok = false, processing = false, error = ex.Message });
        }
        finally
        {
            lock (gate) { busy = false; }
        }
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
            var result = GetDIBits(memoryDc, bitmap, 0, (uint)height, bytes, ref bmi, 0);
            if (result == 0) return null;
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
                    cancelled();
                    Close();
                }
            };
            Closed += (_, _) =>
            {
                if (dragging) cancelled();
                Application.Current.Shutdown();
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
                selected(rect);
                Close();
            }
            else
            {
                cancelled();
                Close();
            }
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
