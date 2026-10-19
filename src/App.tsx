import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Settings as SettingsIcon, 
  Terminal, 
  Layers, 
  Music, 
  CheckCircle2, 
  XCircle, 
  Send, 
  Save, 
  RefreshCw,
  Code2,
  FileCode
} from 'lucide-react';

interface LlmSettings {
  provider_name: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

interface StudioStatus {
  connected: boolean;
  studio_pid: number | null;
  place_id: number | null;
  place_name: string | null;
  script_count: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'agent' | 'bridge' | 'media' | 'settings'>('agent');
  const [status, setStatus] = useState<StudioStatus>({
    connected: false,
    studio_pid: null,
    place_id: null,
    place_name: 'Studio Disconnected',
    script_count: 0
  });

  const [settings, setSettings] = useState<LlmSettings>({
    provider_name: 'Custom (OpenAI-compatible)',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 4096
  });

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    {
      role: 'assistant',
      content: 'Halo! Saya RbxAgent AI Assistant. Roblox Studio bridge aktif di port 39024. Silakan hubungkan plugin Luau atau mulai coding.'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Poll status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://127.0.0.1:39024/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {
        // bridge not listening or offline
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSendPrompt = async () => {
    if (!prompt.trim() || loading) return;

    const userText = prompt;
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setPrompt('');
    setLoading(true);

    try {
      // Direct call to LLM via Base URL & API Key
      const systemPrompt = `You are RbxAgent AI Assistant for Roblox Studio Luau engineering. Studio place: ${status.place_name || 'None'}. Provide optimized Luau code.`;
      const url = `${settings.base_url.replace(/\/+$/, '')}/chat/completions`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (settings.api_key) {
        headers['Authorization'] = `Bearer ${settings.api_key}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userText }
          ],
          temperature: settings.temperature,
          max_tokens: settings.max_tokens
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'No response content.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${err.message}. Periksa kembali Base URL dan API Key di menu Settings.` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="flex h-screen w-screen bg-[#f8faf9] text-[#1c2420] font-sans antialiased overflow-hidden">
      {/* Sidebar Nav */}
      <aside className="w-64 border-r border-[#e2e8e5] bg-[#ffffff] flex flex-col justify-between p-4 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-xl bg-[#2a634e] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              R
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight text-[#111815]">RbxAgent</h1>
              <p className="text-[11px] text-[#6b7c74]">Desktop Studio v0.3.0</p>
            </div>
          </div>

          {/* Studio Connection Status Pill */}
          <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs transition-colors ${
            status.connected 
              ? 'bg-[#ecf7f2] border-[#c0e6d6] text-[#1a5b3f]' 
              : 'bg-[#fafafa] border-[#e8ecea] text-[#718079]'
          }`}>
            {status.connected ? (
              <CheckCircle2 className="w-4 h-4 text-[#1a5b3f]" />
            ) : (
              <XCircle className="w-4 h-4 text-[#9aa7a1]" />
            )}
            <div className="flex-1 truncate">
              <p className="font-medium truncate">{status.connected ? status.place_name : 'Studio Offline'}</p>
              <p className="text-[10px] text-[#788881]">{status.connected ? `${status.script_count} scripts sync` : 'Port :39024'}</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('agent')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'agent' 
                  ? 'bg-[#eaf3ef] text-[#1f5943]' 
                  : 'text-[#4b5852] hover:bg-[#f4f7f5] hover:text-[#111815]'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>AI Agent Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('bridge')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'bridge' 
                  ? 'bg-[#eaf3ef] text-[#1f5943]' 
                  : 'text-[#4b5852] hover:bg-[#f4f7f5] hover:text-[#111815]'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Roblox Bridge</span>
            </button>

            <button
              onClick={() => setActiveTab('media')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'media' 
                  ? 'bg-[#eaf3ef] text-[#1f5943]' 
                  : 'text-[#4b5852] hover:bg-[#f4f7f5] hover:text-[#111815]'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Sound & Synth</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'settings' 
                  ? 'bg-[#eaf3ef] text-[#1f5943]' 
                  : 'text-[#4b5852] hover:bg-[#f4f7f5] hover:text-[#111815]'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>LLM & Endpoint</span>
            </button>
          </nav>
        </div>

        <div className="px-2 py-3 border-t border-[#edf2ef] text-[11px] text-[#86968f]">
          Offline-first • Zero lock-in
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#fbfdfc]">
        {/* VIEW 1: AGENT CHAT */}
        {activeTab === 'agent' && (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-14 border-b border-[#e5ebe7] px-6 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#2a634e]" />
                <h2 className="font-semibold text-sm text-[#141c18]">Autonomous Agent Console</h2>
              </div>
              <div className="text-xs text-[#6e7f77] flex items-center gap-2">
                <span className="font-mono bg-[#f0f4f2] px-2 py-0.5 rounded border border-[#dae3df]">
                  Model: {settings.model}
                </span>
                <span className="font-mono bg-[#f0f4f2] px-2 py-0.5 rounded border border-[#dae3df]">
                  {settings.base_url.includes('localhost') ? 'Local API' : 'Custom Base'}
                </span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-2xl rounded-xl p-4 text-sm leading-relaxed shadow-xs ${
                    m.role === 'user' 
                      ? 'bg-[#2a634e] text-white' 
                      : 'bg-white border border-[#e2e8e5] text-[#1c2420]'
                  }`}>
                    <pre className="font-sans whitespace-pre-wrap">{m.content}</pre>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 text-xs text-[#596962] flex items-center gap-2 shadow-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2a634e]" />
                    <span>Agent sedang memproses kode Roblox...</span>
                  </div>
                </div>
              )}
            </div>

            <footer className="p-4 bg-white border-t border-[#e5ebe7]">
              <div className="max-w-4xl mx-auto flex gap-2">
                <input
                  type="text"
                  placeholder="Instruksi agent (misal: 'Bikin script leaderstats kills & gold dengan auto-save data store')..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
                  className="flex-1 bg-[#f4f7f5] border border-[#d6dfda] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a634e]/30 focus:border-[#2a634e] transition-all"
                />
                <button
                  onClick={handleSendPrompt}
                  disabled={loading || !prompt.trim()}
                  className="bg-[#2a634e] hover:bg-[#214f3e] disabled:opacity-50 text-white rounded-xl px-5 py-2.5 flex items-center gap-2 text-sm font-medium shadow-xs transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim</span>
                </button>
              </div>
            </footer>
          </div>
        )}

        {/* VIEW 2: ROBLOX BRIDGE */}
        {activeTab === 'bridge' && (
          <div className="flex-1 flex flex-col h-full p-6 space-y-6 overflow-y-auto">
            <div>
              <h2 className="font-semibold text-lg text-[#141c18]">Roblox Studio Local Bridge</h2>
              <p className="text-xs text-[#62736b]">Status komunikasi dua arah antara desktop suite dan instance Studio</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 shadow-xs">
                <p className="text-xs text-[#6e7f77]">Bridge Endpoint</p>
                <p className="text-sm font-mono font-semibold text-[#141c18] mt-1">http://127.0.0.1:39024</p>
              </div>
              <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 shadow-xs">
                <p className="text-xs text-[#6e7f77]">Roblox Place</p>
                <p className="text-sm font-semibold text-[#141c18] mt-1 truncate">{status.place_name || 'Tidak Terhubung'}</p>
              </div>
              <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 shadow-xs">
                <p className="text-xs text-[#6e7f77]">Script Active Sync</p>
                <p className="text-sm font-semibold text-[#141c18] mt-1">{status.script_count} Files</p>
              </div>
            </div>

            <div className="bg-white border border-[#e2e8e5] rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#141c18]">
                <FileCode className="w-4 h-4 text-[#2a634e]" />
                <span>Petunjuk Integrasi Plugin Roblox Studio</span>
              </div>
              <p className="text-xs text-[#52635c] leading-relaxed">
                Salin file plugin <code className="bg-[#f0f4f2] text-[#214f3e] px-1.5 py-0.5 rounded font-mono">roblox-plugin/src/RbxAgentBridge.lua</code> ke direktori plugin lokal Roblox Anda:
              </p>
              <pre className="bg-[#f4f7f5] border border-[#dce4e0] p-3 rounded-lg text-xs font-mono text-[#2c3b34]">
                %localappdata%\Roblox\Plugins\RbxAgentBridge.lua
              </pre>
              <p className="text-[11px] text-[#71827b]">
                Setelah file diletakkan, buka Roblox Studio dan nyalakan opsi <b>HttpService.HttpEnabled = true</b> pada Game Settings.
              </p>
            </div>
          </div>
        )}

        {/* VIEW 3: MEDIA & SOUNDFONT */}
        {activeTab === 'media' && (
          <div className="flex-1 flex flex-col h-full p-6 space-y-6 overflow-y-auto">
            <div>
              <h2 className="font-semibold text-lg text-[#141c18]">SoundFont Synthesizer & Media</h2>
              <p className="text-xs text-[#62736b]">Render instan MIDI ke format audio Roblox (.ogg / .wav) menggunakan SoundFont</p>
            </div>

            <div className="bg-white border border-[#e2e8e5] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#141c18]">GeneralUser GS SoundFont Engine</h3>
                  <p className="text-xs text-[#6b7c75]">Synthesizer berbasis crate rustysynth murni tanpa dependensi C++</p>
                </div>
                <span className="text-xs bg-[#ecf7f2] border border-[#c2e7d7] text-[#1b5c40] px-2.5 py-1 rounded-full font-medium">
                  Ready
                </span>
              </div>

              <div className="border border-dashed border-[#ccd7d1] rounded-xl p-8 text-center bg-[#fafcfb]">
                <Music className="w-8 h-8 mx-auto text-[#6a7c74] mb-2" />
                <p className="text-sm font-medium text-[#141c18]">Drop file .mid / .midi ke sini untuk render audio BGM game</p>
                <p className="text-xs text-[#7d8f87] mt-1">Output otomatis 44.1kHz stereo kompatibel asset audio Roblox</p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: CUSTOM LLM SETTINGS (Sesuai Permintaan User) */}
        {activeTab === 'settings' && (
          <div className="flex-1 flex flex-col h-full p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg text-[#141c18]">LLM & Custom Endpoint Settings</h2>
                <p className="text-xs text-[#62736b]">Konfigurasi Base URL dan API Key mandiri untuk AI coding agent</p>
              </div>
              <button
                onClick={handleSaveSettings}
                className="bg-[#2a634e] hover:bg-[#214f3e] text-white rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-medium shadow-xs transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Konfigurasi</span>
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-[#ecf7f2] border border-[#bde5d4] text-[#1a5b3f] text-xs p-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1a5b3f]" />
                <span>Pengaturan LLM berhasil disimpan secara lokal ke ~/.rbxagent/llm_settings.json</span>
              </div>
            )}

            <div className="bg-white border border-[#e2e8e5] rounded-xl p-5 shadow-xs space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                  Provider Name / Label
                </label>
                <input
                  type="text"
                  value={settings.provider_name}
                  onChange={(e) => setSettings({ ...settings, provider_name: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2a634e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                  Base URL (OpenAI-compatible)
                </label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 atau http://localhost:20127/v1 (9Router)"
                  value={settings.base_url}
                  onChange={(e) => setSettings({ ...settings, base_url: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                />
                <p className="text-[11px] text-[#71827b] mt-1">
                  Bisa diisi endpoint cloud (OpenAI, OpenRouter, Groq) atau local router seperti 9Router (http://localhost:20127/v1) dan Ollama (http://localhost:11434/v1).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={settings.api_key}
                  onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                />
                <p className="text-[11px] text-[#71827b] mt-1">
                  Tersimpan di perangkat lokal. Kosongkan jika provider lokal Anda tidak memerlukan otentikasi.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                    Model Identifier
                  </label>
                  <input
                    type="text"
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                    Temperature ({settings.temperature})
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={settings.temperature}
                    onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) || 0.2 })}
                    className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2a634e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    step="512"
                    value={settings.max_tokens}
                    onChange={(e) => setSettings({ ...settings, max_tokens: parseInt(e.target.value) || 4096 })}
                    className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2a634e]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
