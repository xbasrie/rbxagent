# RobloxKit Desktop Suite 1:1

Open-source, self-hosted, modular clone of RobloxKit Desktop. Integrates Autonomous AI coding agents directly with Roblox Studio DataModel through standardized loopback protocols (StudioMCP) and features custom LLM endpoint routing with embedded MIDI SoundFont synthesis.

## Features

- **Custom LLM Endpoint & Secret Management**: Configure custom Base URL (e.g. `http://localhost:20127/v1` for 9Router, `http://localhost:11434/v1` for Ollama, OpenRouter, or OpenAI) and private API keys without cloud lock-in.
- **Roblox Studio Bridge & Luau Plugin**: Bi-directional loopback server on `:39024` with automatic heartbeat, place detection, and Luau script synchronization.
- **Autonomous Agent Console**: Luau script generation, contextual code edits, and real-time diff preview.
- **SoundFont MIDI Engine**: Direct `.sf2` synthesis via `rustysynth` to Roblox-compatible audio formats.
- **Native & Lightweight**: Built on Tauri v2 + Rust, zero Electron overhead, minimal RAM footprint (<60MB).

## Architecture

```
robloxkit-desktop/
├── src-tauri/          # Core backend in Rust
│   ├── src/
│   │   ├── main.rs     # Application entrypoint & IPC router
│   │   ├── settings.rs # Custom LLM endpoint & local configuration
│   │   ├── bridge.rs   # Loopback HTTP server for Roblox Studio (:39024)
│   │   ├── agent.rs    # LLM & Agent Client Protocol runner
│   │   └── media.rs    # SoundFont MIDI synthesis engine (rustysynth)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # Modern minimalist frontend (React 19 + Tailwind CSS)
│   ├── App.tsx         # Console, Studio Bridge, Media & Settings views
│   ├── main.tsx
│   └── index.css
├── roblox-plugin/      # Roblox Studio Luau Plugin
│   └── src/
│       └── RobloxKitBridge.lua # Local sync plugin
└── package.json
```

## Running the Application

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run in Desktop Mode (Tauri)**:
   ```bash
   npm run tauri dev
   ```

3. **Install Roblox Studio Plugin**:
   Copy `roblox-plugin/src/RobloxKitBridge.lua` to:
   - Windows: `%localappdata%\Roblox\Plugins\RobloxKitBridge.lua`
   - macOS: `~/Documents/Roblox/Plugins/RobloxKitBridge.lua`
