# Dynamis Island

> A Dynamic Island-inspired application for Windows featuring media controls, lyrics, productivity tools, and system controls.

Dynamis Island is an Electron-based Windows desktop application. The Island appears at the top of the screen and can expand into a feature panel when the cursor hovers over or clicks the Island area, depending on the selected interaction settings.

## Features

### Island and Personalization

- A transparent, frameless, always-on-top window positioned at the top center of the primary monitor.
- Collapsed, hover/tab bar, and expanded modes, with transparent areas remaining click-through.
- Animated size and position transitions, temporary pinning, and automatic hiding when a foreground application enters fullscreen mode.
- Indonesian and English language options, custom accent colors, and an option to adapt the accent color to album artwork.
- Configurable hover behavior, collapse delay, and song information visibility while the Island is collapsed.

### Media Player and Lyrics

- Displays currently playing media through Windows Media Session, including album artwork, media source, playback position, and playback status.
- Playback controls, shuffle/repeat when supported by the media source, and system/application volume controls.
- Synchronized lyrics retrieved from the local library first, followed by LRCLIB. Both `.lrc` and `.elrc` files can be imported. The lyrics library folder can be selected under **Settings → Lyrics**.
- Lyrics offset configuration and lyrics panel display settings. Mini Lyrics appears from the Media lyrics view when the cursor leaves the Island.
- Japanese lyrics display modes: Original Only, Romaji Only, and Original + Romaji. Romaji rendering uses Kuroshiro and Kuromoji, with Hepburn, Nippon-shiki, and Passport-shiki romanization systems.
- Mini Lyrics reuses the existing lyrics area. Two-line mode does not increase the Island's height, and its width adjusts within the applicable Island size limits.

#### Japanese Romaji Lyrics Support

Navigate to **Settings → Lyrics → Lyrics Display Mode** to choose between:

| Mode | Display |
| --- | --- |
| **Original Only** | Displays the original lyrics text only. This is the default mode. |
| **Romaji Only** | Displays Japanese lyrics romanized using Latin characters. |
| **Original + Romaji** | Displays the original Japanese text on the first line, with Romaji directly underneath. |

When a Romaji mode is enabled, select **Hepburn** (default), **Nippon-shiki**, or **Passport-shiki** under **Romanization System**.

Romaji represents the pronunciation of Japanese writing using Latin characters. It is not an English translation.

Kuroshiro processes the text using the Kuromoji analyzer, allowing kanji readings to be determined based on context. Non-Japanese lyric lines remain unchanged and are not romanized.

These settings apply to both the Media lyrics panel and Mini Lyrics, and are saved as part of the application's preferences.

### Productivity and Information

- **Timer, Focus, Alarm** — Countdown timers, focus sessions, and alarms.
- **Calendar** — Weekly agenda view and event creation.
- **Clock** — Digital and analog clocks, time/date formats, seconds display, and additional information.
- **Weather** — Current weather conditions and forecasts. Locations can be detected automatically or searched manually.
- **Notifications** — Reminders from timers, alarms, and calendar events. Windows toast notification capture can be enabled in Settings. Results depend on the text exposed by the source application through Windows UI Automation.
- **File Tray** — Temporarily store files and folders by dragging them into the tray. Item order and display options are configurable.
- **App Shortcuts** — Quickly launch previously added favorite applications.

### Windows Tools

- **Audio Control** — Master volume, mute, output device selection, and individual volume controls for active applications. Output device selection uses Windows interfaces whose behavior may vary across Windows versions.
- **Quick Settings** — Status indicators and quick access to Wi-Fi, Bluetooth, Airplane Mode, Do Not Disturb, Battery Saver, microphone, display, theme, and audio settings. Some controls redirect to Windows Settings or depend on Windows support.
- **Copy Text From Anything** — Select an area of the screen and extract text using local Windows OCR. Default shortcut: `Ctrl+Alt+T`.
- **Translate Anything** — Translate text or text extracted through OCR from images or selected screen areas. Default screen selection shortcut: `Ctrl+Alt+Y`. Translation providers include Groq and MyMemory. MyMemory can be used without an API key, subject to its daily anonymous usage limits. Screenshots and OCR processing take place locally on the device. Extracted or manually entered text is sent to the selected provider for translation.
- **Clipboard Manager** — Local clipboard history for supported content types, including text, images, links, and files. Automatic capture and item limits are configurable.
- **Quick Notes** — Local notes with automatic saving.
- **System Monitor** — CPU, RAM, disk, and network graphs and metrics, along with a process list. GPU and temperature data are not yet available because a supported sensor provider has not been implemented.

### AI Assistant

The **AI** tab is powered by Groq and requires an API key, which can be configured under **Settings → AI Assistant**.

The assistant can use media, weather, and calendar context based on user preferences. It can also execute several Island actions, including media controls, timer operations, alarm management, and calendar event creation.

Conversation history is stored locally in the application's user profile.

## Settings and Data

The Settings window includes the following sections:

- General
- Language
- Appearance
- Behavior
- Clock
- App Shortcuts
- AI Assistant
- Translation
- Notifications
- Clipboard Manager
- Quick Notes
- Quick Settings
- System Monitor
- File Tray
- Lyrics

Use the Settings search feature to quickly find specific options.

Application settings and data are stored in the Electron user data directory for the currently signed-in Windows user.

The directory location can be viewed and opened through **Settings → General → Data Folder**.

The local lyrics library is optional, and its location can be configured under **Settings → Lyrics**.

## Running from Source

### Requirements

- Windows 10 or Windows 11.
- Node.js 18+ and npm.
- .NET 10 SDK if you want to build the Windows helper or installer.

### Installation and Launch

Run the following commands from PowerShell or your preferred terminal:

```powershell
npm install
npm start
```

The Windows helper handles native integrations such as media sessions, clipboard access, OCR, notifications, and system metrics.

To build the helper independently:

```powershell
npm run build:helper
```

The self-contained Windows x64 helper executable is generated at:

```text
helper-bin/IslandHelper.exe
```

## Testing

Run the available automated test suite using:

```powershell
npm test
```

## Building the Windows Installer

Run:

```powershell
npm run build:win
```

This command builds the .NET 10 helper as a self-contained application and then creates a per-user NSIS installer in:

```text
dist/Dynamis-Island-Setup-<version>.exe
```

The target computer does not need a separate .NET runtime installation.

The installer provides options for selecting the installation directory and creating Start Menu/Desktop shortcuts.

This local build is not published to GitHub and is not signed with a code-signing certificate.

`npm run release:win` runs electron-builder with publishing enabled. **Do not use this command for ordinary local builds.**

The existing production release process uses GitHub Actions and version tags. For more information, see [PANDUAN-GITHUB-RELEASES.md](PANDUAN-GITHUB-RELEASES.md).

The application uses `electron-updater` together with metadata and release artifacts generated by the GitHub Releases workflow.

## Technologies and Main Dependencies

- Electron 33 and JavaScript for the desktop application and user interface.
- C#/.NET 10 native helper for Windows integration.
- `kuroshiro` and `kuroshiro-analyzer-kuromoji` for Japanese romanization and text reading analysis.
- `electron-updater` for the GitHub Releases-based update mechanism.
- `electron-builder` for generating Windows NSIS installers.

## Project Structure

```text
src/main.js                   Main process, windows, IPC, settings, and updater
src/preload.js                Secure API bridge between main process and renderer
src/renderer/                 Island UI, feature tabs, lyrics, and settings renderer
src/settings-window/          Settings window UI
src/lyrics.js                 Lyrics search and source processing
src/romaji.js                 Kuroshiro romanization integration
helper/IslandHelper/          C#/.NET Windows helper
tests/                         Node.js-based automated tests
.github/workflows/release.yml  Windows build and release workflow
```