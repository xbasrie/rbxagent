# RbxAgent 🤖⚡

Open-source, self-hosted, modular desktop suite for Roblox developers. Powered by Tauri v2 + Rust with seamless Roblox Studio DataModel loopback integration (StudioMCP), customizable LLM endpoints, and embedded SoundFont MIDI synthesis.

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)
![Rust](https://img.shields.io/badge/Rust-1.75%2B-red.svg)

---

## ✨ Features

- **Custom LLM Endpoint & Zero Cloud Lock-In**:
  - Full control over your AI provider.
  - Set custom **Base URL** (Ollama, 9Router, OpenRouter, vLLM, LM Studio, or OpenAI) and private API keys.
  - Local settings persistence saved securely in `~/.rbxagent/llm_settings.json`.

- **Roblox Studio Loopback Bridge (StudioMCP)**:
  - Native bi-directional HTTP loopback server listening on `127.0.0.1:39024`.
  - Real-time place detection, heartbeat tracking, and automatic Luau script synchronization.

- **Autonomous Agent Console**:
  - Context-aware Luau code generation and automated debugging.
  - Interactive diff viewer before applying code updates directly to Roblox Studio.

- **Embedded SoundFont Synthesizer**:
  - Built-in GeneralUser GS SoundFont engine via pure Rust `rustysynth`.
  - Convert `.mid` / `.midi` files directly into Roblox-compatible audio assets without external CLI tools.

- **Ultra-Lightweight & Fast**:
  - Pure Rust backend + modern React 19 / Tailwind CSS UI.
  - Zero Electron memory overhead (<60 MB idle RAM footprint).

---

## 🏗️ Architecture

```
rbxagent/
├── .github/workflows/  # CI/CD automated build for Windows .exe (NSIS)
├── src-tauri/          # Core native engine (Rust)
│   ├── src/
│   │   ├── main.rs     # Application entrypoint & Tauri command wiring
│   │   ├── settings.rs # LLM configuration manager & secret storage
│   │   ├── bridge.rs   # Loopback HTTP server for Roblox Studio (:39024)
│   │   ├── agent.rs    # OpenAI-compatible Turn Agent runner
│   │   └── media.rs    # SoundFont MIDI synthesis engine (rustysynth)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # Desktop UI (React 19 + TypeScript + Tailwind CSS)
│   ├── App.tsx         # Agent Console, Studio Bridge, Media & Settings views
│   ├── main.tsx
│   └── index.css
├── roblox-plugin/      # Roblox Studio Luau Plugin
│   └── src/
│       └── RbxAgentBridge.lua # Local sync plugin for Roblox Studio
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable toolchain)
- [Roblox Studio](https://www.roblox.com/create)

### 1. Run in Development Mode

```bash
# Clone the repository
git clone https://github.com/xbasrie/rbxagent.git
cd rbxagent

# Install dependencies
npm install

# Start Tauri development environment
npm run tauri dev
```

---

## 🛠️ Roblox Studio Integration

1. Copy the plugin file:
   - Source: `roblox-plugin/src/RbxAgentBridge.lua`
   - Destination:
     - **Windows**: `%localappdata%\Roblox\Plugins\RbxAgentBridge.lua`
     - **macOS**: `~/Documents/Roblox/Plugins/RbxAgentBridge.lua`
2. Open **Roblox Studio** and open any project/place.
3. Enable HTTP requests:
   - Navigate to **Home** > **Game Settings** > **Security**.
   - Turn ON **Allow HTTP Requests** (`HttpService.HttpEnabled = true`).
4. Look at the RbxAgent dashboard; the status badge will switch to **Studio Connected**.

---

## ⚙️ Custom LLM Configuration

Navigate to the **LLM & Endpoint** tab inside the app to configure your backend:

| Field | Example Value | Description |
|---|---|---|
| **Base URL** | `http://localhost:20127/v1` | 9Router, Ollama, LM Studio, or OpenRouter |
| **API Key** | `sk-...` | Stored locally (can be left blank for local LLMs) |
| **Model** | `gpt-4o` / `qwen2.5-coder` | Target model name |
| **Temperature** | `0.2` | Creativity level |

---

## 📦 Building Windows Executable (`.exe`)

### Automated via GitHub Actions
Push commits or tags (`v*`) to this repository. The `.github/workflows/build-windows.yml` workflow will automatically compile and produce an installer executable in the **Releases / Actions** artifact tab.

### Local Windows Build
On a Windows machine with Rust installed:
```powershell
npm install
npm run tauri build
```
Output executable will be generated at:
```text
src-tauri\target\release\bundle\nsis\RbxAgent_0.3.0_x64-setup.exe
```

---

## 📄 License

MIT License. Free for personal and commercial development.
