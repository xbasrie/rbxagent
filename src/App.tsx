import { useState, useEffect, useCallback, useRef } from 'react';
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
  FileCode,
  Search,
  GitCompare,
  Check,
  X,
  Trash2,
  Upload,
  Package,
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

interface ProposedChange {
  script_id: string;
  script_path: string;
  original_code: string;
  modified_code: string;
  status: string;
}

interface RobloxScriptItem {
  id: string;
  name: string;
  class_name: string;
  parent_path: string;
  source: string;
}

interface ToolboxAsset {
  Name?: string;
  AssetId?: number;
  AssetType?: string;
  Creator?: { Name?: string };
}

type TabId = 'agent' | 'diff' | 'bridge' | 'toolbox' | 'media' | 'settings';

// Helper to safely invoke Tauri commands with browser fallback
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agent', label: 'AI Agent Studio', icon: Bot },
  { id: 'diff', label: 'Diff Viewer', icon: GitCompare },
  { id: 'bridge', label: 'Roblox Bridge', icon: Layers },
  { id: 'toolbox', label: 'Toolbox & Assets', icon: Package },
  { id: 'media', label: 'Sound & Synth', icon: Music },
  { id: 'settings', label: 'LLM & Endpoint', icon: SettingsIcon },
];

// ─── Inline change card shown in agent chat ───
function ChangeCard({ change, onAction }: { change: ProposedChange; onAction: () => void }) {
  const handleApprove = async () => {
    await tauriInvoke('approve_change', { scriptPath: change.script_path });
    onAction();
  };
  const handleReject = async () => {
    await tauriInvoke('reject_change', { scriptPath: change.script_path });
    onAction();
  };

  return (
    <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-[#2a634e] truncate">{change.script_path}</span>
        <span className="text-[10px] bg-[#fef9ec] border border-[#f0dfa0] text-[#8a6d1b] px-2 py-0.5 rounded-full">{change.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono max-h-40 overflow-auto">
        <pre className="bg-[#fef2f2] border border-[#fde2e2] rounded p-2 whitespace-pre-wrap text-[#7f1d1d]">{change.original_code.slice(0, 600)}</pre>
        <pre className="bg-[#ecfdf5] border border-[#d1fae5] rounded p-2 whitespace-pre-wrap text-[#064e3b]">{change.modified_code.slice(0, 600)}</pre>
      </div>
      {change.status === 'pending' && (
        <div className="flex gap-2 justify-end">
          <button onClick={handleApprove} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a634e] text-white hover:bg-[#214f3e] transition-colors">
            <Check className="w-3 h-3" /> Approve
          </button>
          <button onClick={handleReject} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#e2e8e5] text-[#4b5852] hover:bg-[#f4f7f5] transition-colors">
            <X className="w-3 h-3" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const [status, setStatus] = useState<StudioStatus>({
    connected: false,
    studio_pid: null,
    place_id: null,
    place_name: 'Studio Disconnected',
    script_count: 0,
  });

  const [settings, setSettings] = useState<LlmSettings>({
    provider_name: 'Custom (OpenAI-compatible)',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 4096,
  });

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Halo! Saya RbxAgent AI Assistant. Roblox Studio bridge aktif di port 39024. Silakan hubungkan plugin Luau atau mulai coding.' },
  ]);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pending changes (used in agent + diff tabs)
  const [pendingChanges, setPendingChanges] = useState<ProposedChange[]>([]);

  // Bridge tab
  const [scripts, setScripts] = useState<RobloxScriptItem[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);

  // Toolbox tab
  const [toolboxQuery, setToolboxQuery] = useState('');
  const [toolboxType, setToolboxType] = useState('Model');
  const [toolboxResults, setToolboxResults] = useState<ToolboxAsset[]>([]);
  const [toolboxSearching, setToolboxSearching] = useState(false);

  // Media tab
  const [sfLoaded, setSfLoaded] = useState(false);
  const [midiRendered, setMidiRendered] = useState(false);
  const [mediaMsg, setMediaMsg] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingChanges]);

  // Load settings on mount
  useEffect(() => {
    tauriInvoke<LlmSettings>('get_llm_settings').then(loaded => {
      if (loaded) setSettings(loaded);
    });
  }, []);

  // Poll studio status
  useEffect(() => {
    const fetchStatus = async () => {
      const native = await tauriInvoke<StudioStatus>('get_studio_status');
      if (native) { setStatus(native); return; }
      try {
        const res = await fetch('http://127.0.0.1:39024/status');
        if (res.ok) setStatus(await res.json());
      } catch { /* offline */ }
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 3000);
    return () => clearInterval(iv);
  }, []);

  const refreshPendingChanges = useCallback(async () => {
    const changes = await tauriInvoke<ProposedChange[]>('get_pending_changes');
    if (changes) setPendingChanges(changes);
  }, []);

  // Poll pending changes when on agent or diff tab
  useEffect(() => {
    if (activeTab !== 'agent' && activeTab !== 'diff') return;
    refreshPendingChanges();
    const iv = setInterval(refreshPendingChanges, 5000);
    return () => clearInterval(iv);
  }, [activeTab, refreshPendingChanges]);

  // ─── Agent chat ───
  const handleSendPrompt = async () => {
    if (!prompt.trim() || loading) return;
    const userText = prompt;
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setPrompt('');
    setLoading(true);

    try {
      const backendReply = await tauriInvoke<string>('send_agent_prompt', { prompt: userText });
      if (backendReply) {
        setMessages(prev => [...prev, { role: 'assistant', content: backendReply }]);
        await refreshPendingChanges();
        setLoading(false);
        return;
      }

      // Fallback: direct LLM call
      const systemPrompt = `You are RbxAgent AI Assistant for Roblox Studio Luau engineering. Studio place: ${status.place_name || 'None'}. Provide optimized Luau code.`;
      const url = `${settings.base_url.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.api_key) headers['Authorization'] = `Bearer ${settings.api_key}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userText },
          ],
          temperature: settings.temperature,
          max_tokens: settings.max_tokens,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'No response content.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}. Periksa kembali Base URL dan API Key di menu Settings.` }]);
    } finally {
      setLoading(false);
      await refreshPendingChanges();
    }
  };

  const handleClearHistory = async () => {
    await tauriInvoke('clear_agent_history');
    setMessages([{ role: 'assistant', content: 'History cleared. Ready for new instructions.' }]);
    setPendingChanges([]);
  };

  // ─── Settings ───
  const handleSaveSettings = async () => {
    await tauriInvoke('save_llm_settings', { settings });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // ─── Bridge: load scripts ───
  const handleLoadScripts = async () => {
    setScriptsLoading(true);
    const result = await tauriInvoke<RobloxScriptItem[]>('get_studio_scripts');
    if (result) setScripts(result);
    setScriptsLoading(false);
  };

  // ─── Toolbox search ───
  const handleToolboxSearch = async () => {
    if (!toolboxQuery.trim()) return;
    setToolboxSearching(true);
    try {
      const raw = await tauriInvoke<string>('search_toolbox_assets', { query: toolboxQuery, assetType: toolboxType });
      if (raw) {
        const parsed: ToolboxAsset[] = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as ToolboxAsset[]);
        setToolboxResults(parsed);
      }
    } catch { /* parse error */ }
    setToolboxSearching(false);
  };

  // ─── Media: pick files ───
  const handlePickSoundfont = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({ title: 'Select SoundFont (.sf2)', filters: [{ name: 'SoundFont', extensions: ['sf2'] }] });
      if (!path) return;
      setMediaMsg('Loading soundfont...');
      const bytes = await readFile(path);
      await tauriInvoke('load_soundfont', { data: Array.from(bytes) });
      setSfLoaded(true);
      setMediaMsg('SoundFont loaded successfully.');
    } catch {
      setMediaMsg('Failed to load soundfont.');
    }
  };

  const handlePickMidi = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({ title: 'Select MIDI file', filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }] });
      if (!path) return;
      setMediaMsg('Rendering MIDI...');
      const bytes = await readFile(path);
      const result = await tauriInvoke<number[]>('render_midi', { midiBytes: Array.from(bytes) });
      if (result) {
        setMidiRendered(true);
        setMediaMsg(`MIDI rendered: ${result.length} samples.`);
      } else {
        setMediaMsg('MIDI render returned no data.');
      }
    } catch {
      setMediaMsg('Failed to render MIDI.');
    }
  };

  // ─── Sidebar nav button ───
  const navBtn = (tab: TabId, label: string, Icon: typeof Bot) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        activeTab === tab
          ? 'bg-[#eaf3ef] text-[#1f5943]'
          : 'text-[#4b5852] hover:bg-[#f4f7f5] hover:text-[#111815]'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen w-screen bg-[#f8faf9] text-[#1c2420] font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#e2e8e5] bg-[#ffffff] flex flex-col justify-between p-4 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-xl bg-[#2a634e] text-white flex items-center justify-center font-bold text-lg shadow-sm">R</div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight text-[#111815]">RbxAgent</h1>
              <p className="text-[11px] text-[#6b7c74]">Desktop Studio v0.3.0</p>
            </div>
          </div>

          {/* Status pill */}
          <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs transition-colors ${
            status.connected
              ? 'bg-[#ecf7f2] border-[#c0e6d6] text-[#1a5b3f]'
              : 'bg-[#fafafa] border-[#e8ecea] text-[#718079]'
          }`}>
            {status.connected ? <CheckCircle2 className="w-4 h-4 text-[#1a5b3f]" /> : <XCircle className="w-4 h-4 text-[#9aa7a1]" />}
            <div className="flex-1 truncate">
              <p className="font-medium truncate">{status.connected ? (status.place_name || 'Connected Place') : 'Studio Offline'}</p>
              <p className="text-[10px] text-[#788881]">{status.connected ? `${status.script_count} scripts sync` : 'Port :39024'}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {TABS.map(t => navBtn(t.id, t.label, t.icon))}
          </nav>
        </div>

        <div className="px-2 py-3 border-t border-[#edf2ef] text-[11px] text-[#86968f]">
          Offline-first &bull; Zero lock-in
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#fbfdfc]">
        {/* ═══ TAB 1: AGENT CHAT ═══ */}
        {activeTab === 'agent' && (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-14 border-b border-[#e5ebe7] px-6 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#2a634e]" />
                <h2 className="font-semibold text-sm text-[#141c18]">Autonomous Agent Console</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-[#f0f4f2] px-2 py-0.5 rounded border border-[#dae3df] text-[#6e7f77]">
                  Model: {settings.model}
                </span>
                <button onClick={handleClearHistory} className="text-xs text-[#6e7f77] hover:text-[#1c2420] flex items-center gap-1 px-2 py-1 rounded border border-[#e2e8e5] hover:bg-[#f4f7f5] transition-colors">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-2xl rounded-xl p-4 text-sm leading-relaxed shadow-xs ${
                    m.role === 'user'
                      ? 'bg-[#2a634e] text-white'
                      : 'bg-white border border-[#e2e8e5] text-[#1c2420]'
                  }`}>
                    <pre className="font-sans whitespace-pre-wrap">{m.content}</pre>
                  </div>
                </div>
              ))}
              {/* Inline pending changes */}
              {pendingChanges.filter(c => c.status === 'pending').map(c => (
                <ChangeCard key={c.script_id} change={c} onAction={refreshPendingChanges} />
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#e2e8e5] rounded-xl p-4 text-xs text-[#596962] flex items-center gap-2 shadow-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2a634e]" />
                    <span>Agent sedang memproses kode Roblox...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <footer className="p-4 bg-white border-t border-[#e5ebe7]">
              <div className="max-w-4xl mx-auto flex gap-2">
                <input
                  type="text"
                  placeholder="Instruksi agent (misal: 'Bikin script leaderstats kills & gold dengan auto-save data store')..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendPrompt()}
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

        {/* ═══ TAB 2: DIFF VIEWER ═══ */}
        {activeTab === 'diff' && (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-14 border-b border-[#e5ebe7] px-6 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-[#2a634e]" />
                <h2 className="font-semibold text-sm text-[#141c18]">Proposed Changes</h2>
                <span className="text-xs bg-[#f0f4f2] px-2 py-0.5 rounded border border-[#dae3df] text-[#6e7f77]">
                  {pendingChanges.length} items
                </span>
              </div>
              <button onClick={refreshPendingChanges} className="text-xs text-[#6e7f77] hover:text-[#1c2420] flex items-center gap-1 px-2 py-1 rounded border border-[#e2e8e5] hover:bg-[#f4f7f5] transition-colors">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {pendingChanges.length === 0 && (
                <div className="text-center py-16 text-sm text-[#6e7f77]">No proposed changes. Use the Agent to generate code modifications.</div>
              )}
              {pendingChanges.map(c => (
                <div key={c.script_id} className="bg-white border border-[#e2e8e5] rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-semibold text-[#141c18] truncate">{c.script_path}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      c.status === 'pending'
                        ? 'bg-[#fef9ec] border border-[#f0dfa0] text-[#8a6d1b]'
                        : c.status === 'approved'
                          ? 'bg-[#ecf7f2] border border-[#c0e6d6] text-[#1a5b3f]'
                          : 'bg-[#fef2f2] border border-[#fde2e2] text-[#7f1d1d]'
                    }`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-[#7f1d1d] mb-1">Original</p>
                      <pre className="bg-[#fef2f2] border border-[#fde2e2] rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-auto text-[#7f1d1d]">{c.original_code}</pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#064e3b] mb-1">Modified</p>
                      <pre className="bg-[#ecfdf5] border border-[#d1fae5] rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-auto text-[#064e3b]">{c.modified_code}</pre>
                    </div>
                  </div>
                  {c.status === 'pending' && (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={async () => { await tauriInvoke('approve_change', { scriptPath: c.script_path }); refreshPendingChanges(); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a634e] text-white hover:bg-[#214f3e] transition-colors"
                      >
                        <Check className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={async () => { await tauriInvoke('reject_change', { scriptPath: c.script_path }); refreshPendingChanges(); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#e2e8e5] text-[#4b5852] hover:bg-[#f4f7f5] transition-colors"
                      >
                        <X className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ TAB 3: ROBLOX BRIDGE ═══ */}
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

            {/* Plugin install instructions */}
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

            {/* Live script list */}
            <div className="bg-white border border-[#e2e8e5] rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#141c18]">
                  <FileCode className="w-4 h-4 text-[#2a634e]" />
                  <span>Studio Scripts</span>
                </div>
                <button onClick={handleLoadScripts} disabled={scriptsLoading} className="text-xs text-[#6e7f77] hover:text-[#1c2420] flex items-center gap-1 px-2 py-1 rounded border border-[#e2e8e5] hover:bg-[#f4f7f5] transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${scriptsLoading ? 'animate-spin' : ''}`} /> Load Scripts
                </button>
              </div>
              {scripts.length === 0 ? (
                <p className="text-xs text-[#6e7f77]">No scripts loaded. Click "Load Scripts" while Studio is connected.</p>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {scripts.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#f8faf9] border border-[#e8ecea] text-xs">
                      <FileCode className="w-3.5 h-3.5 text-[#2a634e] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#141c18] truncate">{s.name}</p>
                        <p className="text-[10px] text-[#71827b] truncate">{s.parent_path} &middot; {s.class_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB 4: TOOLBOX & ASSETS ═══ */}
        {activeTab === 'toolbox' && (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-14 border-b border-[#e5ebe7] px-6 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#2a634e]" />
                <h2 className="font-semibold text-sm text-[#141c18]">Toolbox & Asset Search</h2>
              </div>
            </header>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search assets (e.g. 'sword', 'tree', 'car')..."
                  value={toolboxQuery}
                  onChange={e => setToolboxQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleToolboxSearch()}
                  className="flex-1 bg-[#f4f7f5] border border-[#d6dfda] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a634e]/30 focus:border-[#2a634e] transition-all"
                />
                <select
                  value={toolboxType}
                  onChange={e => setToolboxType(e.target.value)}
                  className="bg-[#f4f7f5] border border-[#d6dfda] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2a634e]"
                >
                  <option value="Model">Model</option>
                  <option value="Decal">Decal</option>
                  <option value="Audio">Audio</option>
                  <option value="Plugin">Plugin</option>
                  <option value="MeshPart">MeshPart</option>
                </select>
                <button
                  onClick={handleToolboxSearch}
                  disabled={toolboxSearching || !toolboxQuery.trim()}
                  className="bg-[#2a634e] hover:bg-[#214f3e] disabled:opacity-50 text-white rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-medium shadow-xs transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </button>
              </div>

              {toolboxSearching && (
                <div className="flex items-center gap-2 text-xs text-[#596962]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2a634e]" /> Searching...
                </div>
              )}

              {toolboxResults.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {toolboxResults.map((asset, idx) => (
                    <div key={idx} className="bg-white border border-[#e2e8e5] rounded-xl p-4 shadow-xs space-y-1">
                      <p className="text-sm font-semibold text-[#141c18] truncate">{asset.Name || 'Unnamed'}</p>
                      <p className="text-[10px] text-[#6e7f77]">ID: {asset.AssetId || 'N/A'}</p>
                      <p className="text-[10px] text-[#6e7f77]">Type: {asset.AssetType || toolboxType}</p>
                      {asset.Creator?.Name && <p className="text-[10px] text-[#6e7f77]">By: {asset.Creator.Name}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!toolboxSearching && toolboxResults.length === 0 && toolboxQuery && (
                <div className="text-center py-16 text-sm text-[#6e7f77]">No results. Try a different query or asset type.</div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB 5: SOUND & SYNTH ═══ */}
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
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sfLoaded ? 'bg-[#ecf7f2] border border-[#c2e7d7] text-[#1b5c40]' : 'bg-[#fafafa] border border-[#e8ecea] text-[#718079]'}`}>
                  {sfLoaded ? 'Loaded' : 'No SF2'}
                </span>
              </div>

              <div className="flex gap-3">
                <button onClick={handlePickSoundfont} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-[#d6dfda] bg-[#f4f7f5] hover:bg-[#eaf3ef] text-[#1c2420] transition-colors">
                  <Upload className="w-4 h-4" /> Load .sf2
                </button>
                <button onClick={handlePickMidi} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-[#d6dfda] bg-[#f4f7f5] hover:bg-[#eaf3ef] text-[#1c2420] transition-colors">
                  <Music className="w-4 h-4" /> Render .mid
                </button>
              </div>

              {mediaMsg && (
                <div className={`text-xs p-3 rounded-xl flex items-center gap-2 ${
                  mediaMsg.includes('Failed') ? 'bg-[#fef2f2] border border-[#fde2e2] text-[#7f1d1d]' : 'bg-[#ecf7f2] border border-[#bde5d4] text-[#1a5b3f]'
                }`}>
                  {midiRendered || sfLoaded ? <CheckCircle2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                  <span>{mediaMsg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB 6: LLM SETTINGS ═══ */}
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
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">Provider Name / Label</label>
                <input
                  type="text"
                  value={settings.provider_name}
                  onChange={e => setSettings({ ...settings, provider_name: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2a634e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">Base URL (OpenAI-compatible)</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 atau http://localhost:20127/v1 (9Router)"
                  value={settings.base_url}
                  onChange={e => setSettings({ ...settings, base_url: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                />
                <p className="text-[11px] text-[#71827b] mt-1">
                  Bisa diisi endpoint cloud (OpenAI, OpenRouter, Groq) atau local router seperti 9Router (http://localhost:20127/v1) dan Ollama (http://localhost:11434/v1).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1c2420] mb-1">API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={settings.api_key}
                  onChange={e => setSettings({ ...settings, api_key: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                />
                <p className="text-[11px] text-[#71827b] mt-1">
                  Tersimpan di perangkat lokal. Kosongkan jika provider lokal Anda tidak memerlukan otentikasi.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">Model Identifier</label>
                  <input
                    type="text"
                    value={settings.model}
                    onChange={e => setSettings({ ...settings, model: e.target.value })}
                    className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2a634e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">Temperature ({settings.temperature})</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={settings.temperature}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setSettings({ ...settings, temperature: isNaN(val) ? 0.2 : val });
                    }}
                    className="w-full bg-[#f8faf9] border border-[#d6dfda] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2a634e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1c2420] mb-1">Max Tokens</label>
                  <input
                    type="number"
                    step="512"
                    value={settings.max_tokens}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setSettings({ ...settings, max_tokens: isNaN(val) ? 4096 : val });
                    }}
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
