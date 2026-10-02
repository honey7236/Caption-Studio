# Caption Studio — Project Memory & Architecture Guide

## Project Overview
**Caption Studio (Followers Edition)** is a Windows-based, 100% local video captioning and reel-editing application. It runs completely offline (no API keys, no cloud dependencies, no accounts required) except for initial Google Fonts streaming during preview/export. It provides automated speech transcription, script-forced alignment, interactive word-level editing with audio realign, live React/Remotion preview, customizable viral caption templates (e.g., Hormozi, Mr Beast, Kalakar, Clean, Karaoke), and local MP4 rendering.

---

## Tech Stack & Dependencies

### Backend & AI
- **Python 3.12** in virtual environment (`.venv\Scripts\python.exe`)
- **FastAPI (0.141.1) & Uvicorn (0.52.4)**: Local web server running on `http://127.0.0.1:8756`.
- **faster-whisper (1.2.1) & stable-ts (2.19.1)**: Word-level speech recognition, timestamps, and forced alignment. CPU int8 execution by default for broad PC compatibility.
- **indic-transliteration (2.3.82)**: Transliterates Devanagari and Indic scripts into Roman script (essential for Hinglish / Indian language reels).
- **FFmpeg & FFprobe (Gyan.FFmpeg)**: Video probing, rotation detection, 1080p downscaling with faststart, audio extraction, and subtitle burns.

### Frontend & Video Rendering
- **Node.js LTS (v20+)**
- **Remotion 4.0.518 (`@remotion/renderer`, `@remotion/bundler`, `@remotion/player`, `@remotion/google-fonts`)**: Programmatic React-based video composition and export.
- **React 19 & React DOM 19**: Powers the in-browser live caption preview player.
- **esbuild**: Pre-bundles `remotion/src/player-entry.jsx` into standalone `static/player.js`.
- **Vanilla HTML5/CSS3/JS (`index.html`)**: Clean, responsive dark UI featuring drag-and-drop upload, inline word timings editor, bulk script editor, template gallery, transition controls, and real-time progress indicators.

---

## Directory Structure & Key Files

```
Caption-Studio-Followers/
├── GEMINI.md                          # Persistent project context & architecture guide (this file)
├── server.py                          # FastAPI application, REST endpoints, job management, subprocess dispatcher
├── transcribe.py                      # Speech recognition (faster-whisper) and forced alignment (stable-ts)
├── render.py                          # Alternative/fallback FFmpeg/libass subtitle renderer
├── index.html                         # Single-page web UI
├── runtime-path.txt                   # Injected paths for Node.js and FFmpeg binaries
├── requirements.txt                   # Python dependencies
├── VERSION.txt                        # Release version and build metadata
├── README-FIRST.txt                   # User instructions and troubleshooting
│
├── remotion/                          # Remotion video rendering package
│   ├── package.json                   # Remotion, React, and Google Fonts dependencies
│   ├── renderjob.mjs                  # Headless rendering script invoking @remotion/renderer
│   ├── build.mjs                      # esbuild bundler producing static/player.js
│   ├── .bundle/                       # Bundled Remotion web assets for headless render
│   ├── public/                        # Staged source videos accessible to Remotion staticFile
│   └── src/
│       ├── Captions.jsx               # Remotion React component rendering timed caption lines & words
│       ├── Root.jsx                   # Remotion root registering the "Captions" composition
│       ├── index.js                   # Entry point for Remotion bundle
│       ├── player-entry.jsx           # Browser preview entry point exposing window.CS
│       ├── templates.js               # 30+ caption styles, animations, and CSS generators
│       └── fonts.js                   # Google Fonts loaders and cache
│
├── static/
│   └── player.js                      # Bundled Remotion player compiled by esbuild
├── fonts/                             # Optional local font cache for FFmpeg/libass
├── work/                              # Ephemeral job working directories (<job_id>/)
├── out/                               # Default export directory
│
├── SETUP.bat                          # First-time Windows setup launcher
├── setup.ps1                          # PowerShell installer (Python, Node, FFmpeg via winget, venv, npm)
├── start.bat                          # Launches server with console log window and auto-restart loop
├── Caption Studio.vbs                 # Silent background launcher (pythonw.exe) opening browser
└── Stop Caption Studio.bat            # Finds process on port 8756 and terminates it
```

---

## Core Workflows & Execution Pipeline

### 1. Transcribe & Align Pipeline (`/api/transcribe`)
1. User drops a video file (`.mp4`, `.mov`, `.webm`, etc., up to 2GB) and selects language / romanization settings.
2. An optional user script can be provided for instant, word-perfect forced alignment.
3. A unique 12-character hex `job_id` is assigned. Video saved to `work/<job_id>/src.<ext>`.
4. `transcribe.py` executes:
   - **Script Provided**: Runs `stable_whisper.load_model('base').align(video, script)`. Takes ~2 seconds.
   - **No Script**: Runs `stable_whisper.load_faster_whisper('small', device='cpu', compute_type='int8')`.
   - Normalizes text, performs Indic transliteration if Hinglish/Roman requested, fixes common phonetic misspellings (e.g. "kontent" -> "content", "kod" -> "code"), adjusts overlapping timings, and ensures a minimum duration (0.12s) per word.
   - Outputs `work/<job_id>/src.words.json`.
5. In parallel / sequence, `probe()` extracts width, height, duration, and metadata rotation (transposing 90° portrait videos).
6. Videos exceeding 1080p width are downscaled to 1080p using `ffmpeg -vf scale=... -preset veryfast` and staged to `remotion/public/<job_id>.mp4`.

### 2. Word Editing & Audio Re-Alignment (`/api/realign`)
- Users can edit words, split words, add words, or paste an entire modified script in the UI.
- Calling `/api/realign` re-runs `transcribe.py --script` against the audio to mathematically lock the newly edited text back to the real speech timings without temporal drift.

### 3. Live Browser Preview (`window.CS` & `static/player.js`)
- `index.html` loads `static/player.js`.
- It mounts `@remotion/player` inside `#playerWrap` directly in the DOM.
- Any UI tweak (font selection, font size, text color, accent color, outline, Y-position, template style, uppercase toggle, one-word mode, line transitions) calls `window.CS.update({...})` for instant 60fps canvas/CSS preview without re-rendering video.

### 4. Video Export Pipeline (`/api/render`)
1. UI sends current props (words, template name, font, style overrides, transition, 1080p/720p height, quality CRF) to `/api/render`.
2. Server writes `work/<job_id>/props.json`.
3. Server executes `node remotion/renderjob.mjs <props.json> <output.mp4>`.
4. `renderjob.mjs`:
   - Checks if `remotion/src/` has newer mtime than `.bundle/.ok`. If so, dynamically bundles Remotion.
   - Ensures video file is in `.bundle/public/<job_id>.mp4`.
   - Runs `renderMedia` with Chromium ANGLE OpenGL backend and concurrency 4.
   - Continuously writes progress (`pct` and `stage`: "drawing captions" / "adding audio") to `work/<job_id>/render.json`.
5. Frontend polls `/api/render-progress/<job_id>` and updates progress bar.
6. Server returns download URL `/api/file/<job_id>/captioned_<template>.mp4`.

---

## Important Architectural Notes & Quirks

1. **Windows Event Loop Fix (`server.py`)**:
   - On Windows, Uvicorn defaults to `ProactorEventLoop`, which causes `WinError 64 (The specified network name is no longer available)` crashes when browsers terminate video streaming range requests prematurely.
   - `server.py` explicitly builds and binds `asyncio.SelectorEventLoop()` and executes all blocking subprocesses via `asyncio.to_thread`.
2. **Path Management (`runtime-path.txt`)**:
   - `setup.ps1` writes Node.js and FFmpeg directories to `runtime-path.txt`.
   - `server.py` reads `runtime-path.txt` at startup and prepends them to `os.environ["PATH"]`. This allows the app to run immediately without requiring a Windows reboot after winget installations.
3. **Cross-Origin Guard Middleware**:
   - The server only allows requests from `LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}` to protect users from malicious web pages driving local video generation.
4. **Job Sweeper**:
   - `sweep_old(hours=24)` deletes job folders older than 24 hours upon new transcription calls.
5. **Rebuilding the Player Bundle**:
   - If changes are made to `remotion/src/player-entry.jsx`, `templates.js`, or `Captions.jsx`, the frontend bundle must be regenerated with:
     ```powershell
     cd remotion
     node build.mjs
     ```
6. **Color Architecture (`templates.js`)**:
   - `wordCss` supports dynamic Text (Primary) and Accent colors for all 30+ templates.
   - For solid colors and active highlights (`#ACCENT`), `accent` and `color` override defaults.
   - For gradients (`def.grad` and `act.grad`), color transformations dynamically calculate shades based on `color` and `accent`.
   - Box and pill templates automatically compute high-contrast foreground text based on luminance (`isLightColor`).
7. **User Presets Subsystem**:
   - Stored in `localStorage["capstudio.user_presets_list"]`.
   - Dedicated "Saved Presets" gallery section at the top of the Templates tab in `index.html`.
   - Supports naming, card visual preview, 1-click apply, and deletion.
