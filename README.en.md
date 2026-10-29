# dsh-corner-alert

> Bottom-right alerts for the DeepSeek Harness (DSH) Web GUI / Desktop: a toast + chime + system notification when a turn finishes or the agent needs your action, plus a floating "⟳ Hot restart" chip.

[![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-blue)](#supported-platforms)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English | [中文](README.md)

---

## Contents

- [What it is](#what-it-is)
- [What you see](#what-you-see)
- [Supported platforms](#supported-platforms)
- [Install](#install)
- [Usage](#usage)
- [Hot restart chip](#hot-restart-chip)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Compatibility & updates](#compatibility--updates)
- [Uninstall](#uninstall)
- [Layout](#layout)
- [Development & tests](#development--tests)
- [License](#license)

---

## What it is

`dsh-corner-alert` is a **client plugin** for the DeepSeek Harness (DSH) Web GUI / Desktop app.

It watches the session status projection the harness already maintains (`uiSession.sessionStatus`) and raises an alert on two real transitions:

| Transition | Toast | Sound |
|---|---|---|
| A running turn settles back to idle with no pending interaction | Task finished | two-tone chime |
| A pending interaction appears (tool approval or agent question) | Your action is needed | three-tone chime |

Highlights:

- **No polling, no double-folding**: reads the status projection directly.
- **Multi-round coalescing**: a 1200 ms settle window collapses the gaps of a multi-round goal into one alert.
- **Sub-agents silent by default** (opt-in).
- **Native notification fallback**: each alert also raises the browser/system `Notification` so it reaches you when the window is in the background.
- **Floating "⟳ Hot restart" chip** to apply plugin/theme changes instantly.

---

## What you see

When a turn finishes, a card appears at the bottom-right (above the composer):

```
┌────────────────────────────────────┐
│ ●  Task finished        [Open] [×]  │
│    The turn finished — come back…   │
└────────────────────────────────────┘
```

- **Open** jumps to that session; **×** dismisses; auto-dismiss after 7 s.
- Follows the DSH light/dark theme (uses `--dsw-alias-*` / `--dsw-radius-*` tokens only).
- A native system notification is raised alongside it.
- A small "⟳ Hot restart" pill sits at the bottom-right.

When the agent needs you, the card border/dot turns to a warning tone and names the tool awaiting approval.

---

## Supported platforms

| Item | Requirement |
|---|---|
| Host | DeepSeek Harness (DSH) Web GUI or Desktop (Electron) |
| OS | Windows / macOS / Linux (anywhere DSH runs — plugin is pure browser-side JS) |
| Host APIs | needs the `shell.overlay` slot and the `uiSession.sessionStatus` projection (present in DSH 0.1.x / 0.2.x) |
| Runtime deps | none. Only the test harness needs Node |

Verified on Windows 11 + DSH Desktop (Electron, profile `desktop`).

> The host half `index.js` is a no-op; all the behavior lives in the browser half `client.js`.

---

## Install

### 1. From GitHub (recommended)

```bash
# profile is usually `desktop` for the desktop app, `web` for `dsh web`
dsh plugin --profile web add github:3206136467a/dsh-corner-alert
```

`dsh plugin` forwards to pnpm inside the profile; the package is added to `dependencies` and registered in `dsh.profile.bundles` automatically. Restart DSH (or refresh the page) afterwards.

### 2. From a local checkout

```bash
git clone https://github.com/3206136467a/dsh-corner-alert.git
dsh plugin --profile web add file:/absolute/path/to/dsh-corner-alert
```

Windows:

```powershell
dsh plugin --profile desktop add file:C:/Users/you/.dsh/plugins/dsh-corner-alert
```

> Use an **absolute** path after `file:` — a relative path resolves against your shell cwd and often lands wrong.

### 3. Installer scripts

- Windows: `./install.ps1 -Profile desktop`
- macOS/Linux: `./install.sh desktop`

They copy the plugin into `~/.dsh/plugins/dsh-corner-alert` and register it (via `dsh plugin` when available, otherwise by editing `package.json` + `pnpm install`).

### 4. Manual

1. Copy the repo to `~/.dsh/plugins/dsh-corner-alert`.
2. In `~/.dsh/profiles/<profile>/package.json`: add `"dsh-corner-alert": "file:../../plugins/dsh-corner-alert"` to `dependencies`, and `"dsh-corner-alert"` to `dsh.profile.bundles`.
3. `cd ~/.dsh/profiles/<profile> && pnpm install`.
4. Restart DSH or refresh the page.

### Verify

- The "⟳ Hot restart" pill appears at the bottom-right.
- In the DevTools console, `__dshCornerAlert.test()` raises a test toast.

---

## Usage

Nothing to do after install:

1. **Turn finished** — any session finishing a turn raises "Task finished".
2. **Action needed** — a tool approval or agent question raises "Your action is needed".
3. **Multi-round goals** — alerts are coalesced (tune `settleMs`).
4. **Sub-agents** — silent by default; set `subagents` to `1` to include them.

### Console helpers

```js
__dshCornerAlert.test();        // raise a test toast now (fastest way to confirm it is live)
__dshCornerAlert.state();       // settings, visible toasts, audio state
__dshCornerAlert.dismissAll();  // clear all visible toasts
```

---

## Hot restart chip

The bottom-right "⟳ Hot restart" pill:

1. Sends `POST /dsh-market/restart` to dshmarket for a **process-level hot restart**;
2. If the host disallows self-restart (e.g. the DSH desktop app hosted by Electron returns `403`), it falls back to **reloading the page** (`location.reload()`), which also applies freshly changed client plugins / themes.

Requires the **dshmarket** plugin (bundled with the official desktop app). Without it, the chip falls back to a page reload.

---

## Settings

Persisted in `localStorage` under the `dshCornerAlert.` prefix. Change in the DevTools console; applies to the next alert, no reload needed.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `sound` | `true` | Play the chime |
| `native` | `true` | Also raise a system notification |
| `subagents` | `false` | Alert for sub-agent sessions too |
| `settleMs` | `1200` | Quiet window before a finished turn alerts (0–10000 ms) |
| `toastMs` | `7000` | How long a toast stays (1500–60000 ms) |

```js
localStorage.setItem("dshCornerAlert.sound", "0");       // silence
localStorage.setItem("dshCornerAlert.settleMs", "3000"); // wider coalescing
localStorage.setItem("dshCornerAlert.subagents", "1");   // include sub-agents
```

> The first time, the browser asks for notification permission; allow it to receive OS-level alerts while the window is in the background.

---

## How it works

- **Host half `index.js`**: a no-op `apply()` so the package is a valid Cordis Loader row and its manifest is readable by the client-module scanner.
- **Browser half `client.js`**:
  - `ctx.inject(["uiSession"])` → `subscribe` the status projection, fold "running → idle" and "pending interaction appears";
  - settle window de-bounces multi-round goals;
  - toasts register in `shell.overlay` (frame-wide floating layer above every column, outside scroll containers, click-through, cards opt back into pointer events);
  - chime is synthesized with WebAudio (no external audio file);
  - native notification via the `Notification` API;
  - the "Hot restart" chip calls dshmarket's `/dsh-market/restart`, falling back to a page reload.

The overlay keeps living when the Chat panel is switched away, so completion alerts survive a panel change. The stack is anchored `right:20px; bottom:96px` to clear the composer.

---

## Compatibility & updates

- **DSH upgrades don't remove it**: the plugin lives in `~/.dsh/profiles/<profile>` and `~/.dsh/plugins`, independent of the app's `app.asar`. DSH upgrades only replace `app.asar`; the profile is untouched and reloads the plugin from `dsh.profile.bundles` on the next start.
- If a future host changes the shape of `uiSession.sessionStatus`, `client.js` logs a `[corner-alert] ...` warning and disables alerts instead of breaking the page.
- Update: `dsh plugin --profile <profile> add github:3206136467a/dsh-corner-alert` again, or `git pull` in your checkout and restart.

---

## Uninstall

```bash
dsh plugin --profile <profile> remove dsh-corner-alert
```

Or manually remove it from `dependencies` / `dsh.profile.bundles`, delete the folder, `pnpm install`, restart.

---

## Layout

```
dsh-corner-alert/
├── package.json          # manifest + dsh.client declaration
├── cordis.patch.yml      # inserts the Loader row into a profile
├── index.js              # host half: no-op apply()
├── client.js             # browser half: watcher, toast stack, chime, hot-restart chip
├── locale/en.json        # Plugin Manager title/description (English)
├── locale/zh.json        # Chinese
├── icon.svg
├── install.ps1           # Windows installer
├── install.sh            # macOS/Linux installer
├── DISCLAIMER.md         # disclaimer (Chinese + English)
├── README.md / README.en.md
├── LICENSE
└── tests/client.test.mjs # offline harness driving real transitions
```

---

## Development & tests

```bash
node tests/client.test.mjs
```

The harness runs the real `client.js` inside a stand-in module loader and client context, drives real status transitions (seeding, completion, approval, second completion, sub-agent filtering, the manual test entry point) and asserts the toast store, chime calls and native-notification calls — 17 checks. No build step.

---

## Disclaimer

This is a third-party open-source plugin, **not affiliated with or endorsed by DeepSeek / DeepSeek Harness**, provided "AS IS" under the MIT License with no warranty and at your own risk. Alerts may be delayed or fail due to host APIs, notification permission, Do Not Disturb, or host version changes; the plugin collects and uploads nothing; "Hot restart" may reload the page or restart the process and lose unsaved input. Full terms: [DISCLAIMER.md](DISCLAIMER.md).

## License

[MIT](LICENSE)
