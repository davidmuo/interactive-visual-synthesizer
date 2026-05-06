import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { PixelGrid, PixelGridHandle, COLS, ROWS, RESOLUTIONS, PENTATONIC } from './components/PixelGrid';
import { WaveformDisplay } from './components/WaveformDisplay';
import { DrumMachine } from './components/DrumMachine';
import { RetroKeyboard } from './components/RetroKeyboard';
import { XYPad } from './components/XYPad';
import { MoodGrid } from './components/MoodGrid';
import { MixerStrip } from './components/MixerStrip';
import { ToneStrip } from './components/ToneStrip';
import type { MoodValues } from './components/MoodGrid';

// ── Theme system ──
const THEMES = {
  amber:  { name: 'AMBER',  primary: '#ffb000', glow: '#ffcc44', bg: '#0a0a12', danger: '#ff4444' },
  violet: { name: 'VIOLET', primary: '#bf5fff', glow: '#d99fff', bg: '#0c0a14', danger: '#ff6666' },
  ice:    { name: 'ICE',    primary: '#b0c4de', glow: '#e0e8f0', bg: '#0a0c10', danger: '#ff5555' },
} as const;

type ThemeKey = keyof typeof THEMES;

// Resume AudioContext on first user interaction
const _audioResumed = (() => {
  const resume = () => {
    if (Tone.getContext().state !== 'running') {
      Tone.start().catch(() => {});
    }
    window.removeEventListener('click', resume);
    window.removeEventListener('touchstart', resume);
    window.removeEventListener('keydown', resume);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }
  return true;
})();

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const WAVEFORMS = ['sine', 'triangle', 'fmsine', 'amsine'] as const;

function makePreset(name: string, cols: number = COLS, rows: number = ROWS): boolean[][] {
  const g: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  if (name === 'arpeggio') {
    for (let c = 0; c < cols; c++) g[rows - 1 - (c % rows)][c] = true;
  } else if (name === 'stardust') {
    for (let c = 0; c < cols; c++) { const n = 1 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) g[Math.floor(Math.random() * rows)][c] = true; }
  } else if (name === 'ocean') {
    for (let c = 0; c < cols; c++) { const r1 = Math.floor(((Math.sin((c / cols) * Math.PI * 3) + 1) / 2) * (rows - 1)); const r2 = Math.floor(((Math.sin((c / cols) * Math.PI * 5 + 1) + 1) / 2) * (rows - 1)); g[r1][c] = true; g[r2][c] = true; }
  } else if (name === 'chords') {
    for (let c = 0; c < cols; c += 4) { for (let j = c; j < Math.min(c + 3, cols); j++) { const step = Math.max(1, Math.floor(rows / 6)); for (let k = 1; k <= 5; k++) { const r = Math.min(rows - 1, k * step); g[r][j] = true; } } }
  } else if (name === 'cascade') {
    const pat = [20,18,16,14,12,10,8,6,4,2,0,2,4,6,8,10,12,14,16,18,20,18,16,14,12,10,8,6,4,2,0,2,1,3,5,7,9,11,13,15,17,19,21,23,21,19,17,15,13,11,9,7,5,3,1,3,5,7,9,11,13,15,17,19];
    for (let c = 0; c < cols; c++) { const r = Math.min(rows - 1, Math.max(0, pat[c % pat.length])); g[r][c] = true; if (r + 1 < rows) g[r + 1][c] = true; }
  } else if (name === 'shimmer') {
    for (let c = 0; c < cols; c++) { if (c % 2 === 0) { const base = Math.floor(Math.sin(c / 6) * 4 + rows / 2); for (let off = -1; off <= 1; off += 2) { const r = base + off * 3; if (r >= 0 && r < rows) g[r][c] = true; } } }
  }
  return g;
}

const PRESETS = ['arpeggio', 'stardust', 'ocean', 'chords', 'cascade', 'shimmer'];

// ── Themed components ──
function ABtn({ children, onClick, active, className = '', small = false, danger = false, color = '#ffb000', bgColor = '#0c0c14' }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; className?: string; small?: boolean; danger?: boolean; color?: string; bgColor?: string;
}) {
  const c = danger ? '#ff4444' : color;
  return (
    <button
      onClick={onClick}
      className={`transition-all duration-75 select-none active:translate-y-[1px] flex items-center justify-center gap-1 whitespace-nowrap ${className}`}
      style={{
        fontSize: small ? '7px' : '8px',
        letterSpacing: '0.08em',
        padding: small ? '2px 5px' : '3px 8px',
        color: active ? bgColor : c,
        background: active ? c : `${c}0a`,
        border: `1px solid ${active ? c : `${c}33`}`,
        boxShadow: active ? `0 0 8px ${c}4d` : 'none',
        textShadow: active ? 'none' : `0 0 4px ${c}4d`,
        borderRadius: 3,
      }}
    >{children}</button>
  );
}

function Divider({ color = '#ffb000' }: { color?: string }) {
  const rgb = hexToRgb(color);
  return <div style={{ height: 1, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`, margin: '4px 0' }} />;
}

function Label({ children, color = '#ffb000' }: { children: React.ReactNode; color?: string }) {
  return <div style={{ fontSize: '7px', letterSpacing: '0.15em', color, opacity: 0.35, marginBottom: 2 }}>{children}</div>;
}

// Collapsible section with click-to-toggle header
function Section({ title, children, defaultOpen = true, color = '#ffb000', bgColor = '#0c0c14' }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; color?: string; bgColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rgb = hexToRgb(color);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between transition-all"
        style={{
          fontSize: '8px',
          letterSpacing: '0.12em',
          color,
          opacity: open ? 0.6 : 0.3,
          padding: '3px 0',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '6px', opacity: 0.6, transition: 'transform 0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          {'\u25BC'}
        </span>
      </button>
      {open && (
        <div style={{ paddingTop: 2 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const gridRef = useRef<PixelGridHandle>(null);
  const [themeKey, setThemeKey] = useState<ThemeKey>('amber');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCol, setCurrentCol] = useState(0);
  const [rootKey, setRootKey] = useState('C');
  const [octaveShift, setOctaveShift] = useState(0);
  const [reverbWet, setReverbWet] = useState(0.4);
  const [delayWet, setDelayWet] = useState(0.25);
  const [delayTime, setDelayTime] = useState<string>('8n');
  const [filterFreq, setFilterFreq] = useState(5000);
  const [volume, setVolume] = useState(-8);
  const [bpm, setBpm] = useState(110);
  const [waveform, setWaveform] = useState<typeof WAVEFORMS[number]>('triangle');
  const [attack, setAttack] = useState(0.1);
  const [release, setRelease] = useState(0.8);
  const [chorusWet, setChorusWet] = useState(0.3);
  const [swing, setSwing] = useState(0);
  const [tool, setTool] = useState<'draw' | 'erase' | 'line'>('draw');
  const [presetIdx, setPresetIdx] = useState(0);
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [noteCount, setNoteCount] = useState(0);
  const [resolutionIdx, setResolutionIdx] = useState(1);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(true);
  const [pan, setPan] = useState(0);
  const [resonance, setResonance] = useState(50);
  const [drive, setDrive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [soloed, setSoloed] = useState(false);
  const [isMasterRecording, setIsMasterRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  // XY Pad
  const [xyX, setXyX] = useState(0.5);
  const [xyY, setXyY] = useState(0.5);
  const [xyMode, setXyMode] = useState<'filter' | 'space' | 'shape'>('filter');
  const [inverted, setInverted] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [brushColor, setBrushColor] = useState<string | null>(null); // null = use theme accent
  const [brushHue, setBrushHue] = useState(30);
  const [brushSat, setBrushSat] = useState(100);
  const [brushLit, setBrushLit] = useState(55);
  const [canvasColor, setCanvasColor] = useState<string | null>(null); // null = use theme bg
  const [canvasHue, setCanvasHue] = useState(240);
  const [canvasSat, setCanvasSat] = useState(10);
  const [canvasLit, setCanvasLit] = useState(8);
  const [colorTarget, setColorTarget] = useState<'brush' | 'canvas'>('brush');

  // Shortcuts overlay
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Derived theme colors — invert swaps primary ↔ bg
  const theme = THEMES[themeKey];
  const tc = inverted ? theme.bg : theme.primary;
  const bgColor = inverted ? theme.primary : theme.bg;
  const glowC = inverted ? theme.bg : theme.glow;
  const rgb = hexToRgb(tc);

  // Effective canvas bg — custom overrides theme
  const canvasBg = canvasColor || bgColor;

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const xyModeRef = useRef(xyMode);
  xyModeRef.current = xyMode;

  const currentRes = RESOLUTIONS[resolutionIdx];
  const gridCols = currentRes.cols;
  const gridRows = currentRes.rows;
  const scale = PENTATONIC[rootKey] || PENTATONIC.C;

  // XY pad handlers — map XY values directly to sound params (no useEffect loop)
  const handleXyXChange = useCallback((v: number) => {
    setXyX(v);
    if (xyModeRef.current === 'filter') setFilterFreq(Math.round(200 + v * 7800));
    else if (xyModeRef.current === 'space') setDelayWet(Math.round(v * 1000) / 1000);
    else if (xyModeRef.current === 'shape') setAttack(Math.round((0.01 + v * 0.49) * 1000) / 1000);
  }, []);

  const handleXyYChange = useCallback((v: number) => {
    setXyY(v);
    if (xyModeRef.current === 'filter') setReverbWet(Math.round(v * 1000) / 1000);
    else if (xyModeRef.current === 'space') setChorusWet(Math.round(v * 1000) / 1000);
    else if (xyModeRef.current === 'shape') setRelease(Math.round((0.1 + v * 1.9) * 1000) / 1000);
  }, []);

  useEffect(() => {
    const g = gridRef.current?.getGrid();
    if (g) { let count = 0; g.forEach((r) => r.forEach((c) => { if (c) count++; })); setNoteCount(count); }
  }, [currentCol]);

  useEffect(() => {
    if (!isPlaying) { if (intervalRef.current) clearTimeout(intervalRef.current); return; }
    // Swing: alternate even/odd step intervals
    // swing 0 = straight, swing 100 = max shuffle (triplet feel)
    const baseInterval = (60000 / bpm) * (4 / gridCols);
    const swingAmount = swing / 100; // 0..1
    let stepIsEven = currentCol % 2 === 0;

    const tick = () => {
      setCurrentCol((prev) => {
        stepIsEven = (prev + 1) % 2 === 0;
        return (prev + 1) % gridCols;
      });
      // Schedule next tick with swing offset
      const nextInterval = stepIsEven
        ? baseInterval * (1 + swingAmount * 0.33)
        : baseInterval * (1 - swingAmount * 0.33);
      intervalRef.current = setTimeout(tick, Math.max(10, nextInterval));
    };

    intervalRef.current = setTimeout(tick, baseInterval);
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, [isPlaying, bpm, gridCols, swing]);

  const handlePlay = async () => {
    if (Tone.getContext().state !== 'running') await Tone.start();
    if (!isPlaying) setCurrentCol(0);
    setIsPlaying(true);
  };
  const handleStop = () => { setIsPlaying(false); setCurrentCol(0); setActiveNotes([]); };
  const handleClear = () => { setIsPlaying(false); setCurrentCol(0); gridRef.current?.clear(); setActiveNotes([]); };

  const cyclePreset = (dir: 1 | -1) => {
    const next = (presetIdx + dir + PRESETS.length) % PRESETS.length;
    setPresetIdx(next);
    setIsPlaying(false); setCurrentCol(0);
    gridRef.current?.setGrid(makePreset(PRESETS[next], gridCols, gridRows));
  };

  const getAnalyserData = useCallback(() => gridRef.current?.getAnalyserData() ?? null, []);

  const handleColTriggered = useCallback((_col: number, notes: string[]) => { setActiveNotes(notes); }, []);

  const handleExport = () => {
    const data = {
      grid: gridRef.current?.getGrid(), key: rootKey, octave: octaveShift, bpm,
      reverb: reverbWet, delay: delayWet, delayTime, filter: filterFreq,
      volume, waveform, attack, release, chorus: chorusWet, swing,
      pan, resonance, drive, theme: themeKey,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `pixelsynth-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportArt = () => {
    const canvas = gridRef.current?.getCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `pixelsynth-art-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target?.result as string);
          if (d.grid) gridRef.current?.setGrid(d.grid);
          if (d.key) setRootKey(d.key);
          if (d.octave !== undefined) setOctaveShift(d.octave);
          if (d.bpm) setBpm(d.bpm);
          if (d.reverb !== undefined) setReverbWet(d.reverb);
          if (d.delay !== undefined) setDelayWet(d.delay);
          if (d.delayTime) setDelayTime(d.delayTime);
          if (d.filter !== undefined) setFilterFreq(d.filter);
          if (d.volume !== undefined) setVolume(d.volume);
          if (d.waveform) setWaveform(d.waveform);
          if (d.attack !== undefined) setAttack(d.attack);
          if (d.release !== undefined) setRelease(d.release);
          if (d.chorus !== undefined) setChorusWet(d.chorus);
          if (d.swing !== undefined) setSwing(d.swing);
          if (d.pan !== undefined) setPan(d.pan);
          if (d.resonance !== undefined) setResonance(d.resonance);
          if (d.drive !== undefined) setDrive(d.drive);
          if (d.muted !== undefined) setMuted(d.muted);
          if (d.soloed !== undefined) setSoloed(d.soloed);
          if (d.theme && d.theme in THEMES) setThemeKey(d.theme);
        } catch { }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Master recording
  const startMasterRecording = async () => {
    try {
      if (Tone.getContext().state !== 'running') await Tone.start();
      const ctx = Tone.getContext().rawContext as AudioContext;
      const dest = ctx.createMediaStreamDestination();
      mediaDestRef.current = dest;
      Tone.getDestination().connect(dest);
      const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `pixelsynth-recording-${Date.now()}.webm`; a.click();
        URL.revokeObjectURL(url);
        if (mediaDestRef.current) { try { Tone.getDestination().disconnect(mediaDestRef.current); } catch { } mediaDestRef.current = null; }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsMasterRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => { setRecordingTime(prev => prev + 1); }, 1000);
    } catch (err) { console.error('Recording failed:', err); }
  };

  const stopMasterRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    setIsMasterRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60); const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Mood grid callback — each row maps to a different parameter
  const handleMoodChange = useCallback((values: MoodValues) => {
    setReverbWet(Math.round(values.reverb * 1000) / 1000);
    setDelayWet(Math.round(values.delay * 1000) / 1000);
    setChorusWet(Math.round(values.chorus * 1000) / 1000);
    setFilterFreq(Math.round(200 + values.filter * 7800));
    setAttack(Math.round((0.01 + values.attack * 0.49) * 1000) / 1000);
    setRelease(Math.round((0.1 + values.release * 1.9) * 1000) / 1000);
  }, []);

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        gridRef.current?.undo();
        return;
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        gridRef.current?.redo();
        return;
      }
      // Ctrl+Y / Cmd+Y = Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        gridRef.current?.redo();
        return;
      }

      // Don't intercept if modifiers are held (except shift)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlaying) handleStop();
          else handlePlay();
          break;
        case 'd': setTool('draw'); break;
        case 'e': setTool('erase'); break;
        case 'l': setTool('line'); break;
        case '/': case '?':
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        case 'Escape':
          if (showShortcuts) setShowShortcuts(false);
          else if (showSaveMenu) setShowSaveMenu(false);
          else if (isPlaying) handleStop();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, showShortcuts, showSaveMenu]);

  return (
    <div
      className="size-full flex flex-col overflow-hidden"
      style={{ backgroundColor: bgColor, fontFamily: "'Share Tech Mono', 'IBM Plex Mono', monospace", color: tc }}
    >
      {/* CRT Scanline overlay */}
      {!inverted && (
        <div className="fixed inset-0 pointer-events-none z-50" style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 2px)',
        }} />
      )}
      {/* Vignette */}
      {!inverted && (
        <div className="fixed inset-0 pointer-events-none z-40" style={{
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)',
        }} />
      )}

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-3" style={{ borderBottom: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`, height: 32, flexShrink: 0, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.015)` }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '11px', letterSpacing: '0.25em', textShadow: `0 0 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.5)` }}>
              PIXELSYNTH
            </span>
            <div className="flex gap-0.5">
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 3, height: 3, background: isPlaying ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`, boxShadow: isPlaying ? `0 0 4px ${tc}` : 'none', borderRadius: '50%' }} />
              ))}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center gap-1">
            <ABtn onClick={isPlaying ? handleStop : handlePlay} active={isPlaying} color={tc} bgColor={bgColor}>
              {isPlaying ? '■ STOP' : '▶ PLAY'}
            </ABtn>
            <div className="flex items-center gap-0.5 ml-1">
              <button onClick={() => setBpm(Math.max(40, bpm - 5))} className="px-1 opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc }}>-</button>
              <div className="text-center" style={{ fontSize: '10px', minWidth: 32, padding: '1px 4px', border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.03)`, borderRadius: 3 }}>
                {bpm}
              </div>
              <button onClick={() => setBpm(Math.min(300, bpm + 5))} className="px-1 opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc }}>+</button>
              <span style={{ fontSize: '7px', opacity: 0.3, marginLeft: 2 }}>BPM</span>
            </div>
          </div>

          {/* Master Record */}
          <button
            onClick={isMasterRecording ? stopMasterRecording : startMasterRecording}
            className="flex items-center gap-1.5 transition-all"
            style={{
              fontSize: '8px', letterSpacing: '0.1em', padding: '3px 10px',
              color: isMasterRecording ? bgColor : theme.danger,
              background: isMasterRecording ? theme.danger : `${theme.danger}10`,
              border: `1px solid ${isMasterRecording ? theme.danger : `${theme.danger}40`}`,
              boxShadow: isMasterRecording ? `0 0 12px ${theme.danger}66` : 'none', borderRadius: 3,
            }}
          >
            {isMasterRecording ? <>&#9632; STOP &middot; {formatTime(recordingTime)}</> : <>&#9679; REC</>}
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3" style={{ fontSize: '8px', opacity: 0.3 }}>
          <span>STEP {String(currentCol + 1).padStart(2, '0')}/{gridCols}</span>
          <span>{gridCols}&times;{gridRows}</span>
          <span>{noteCount} notes</span>
          <span>{rootKey} pentatonic</span>
          {activeNotes.length > 0 && (
            <span style={{ color: theme.glow, opacity: 1, textShadow: `0 0 4px rgba(${rgb.r},${rgb.g},${rgb.b},0.4)` }}>
              {activeNotes.slice(0, 4).join(' ')}
            </span>
          )}
          {isMasterRecording && (
            <span style={{ color: theme.danger, opacity: 1, animation: 'pulse 1s infinite' }}>&#9679; REC</span>
          )}
          {/* Shortcuts help button */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="transition-all hover:opacity-80"
            style={{
              fontSize: '9px', width: 18, height: 18, borderRadius: '50%',
              border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`,
              background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
              color: tc, opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >?</button>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── LEFT SIDEBAR ── */}
        <div className="flex-shrink-0 flex flex-col p-2 gap-1.5 overflow-y-auto overflow-x-hidden min-h-0" style={{ borderRight: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`, width: 120 }}>

          {/* Key + Octave — always visible, primary control */}
          <div>
            <Label color={tc}>KEY</Label>
            <div className="grid grid-cols-4 gap-1">
              {KEYS.map((k) => (
                <ABtn key={k} onClick={() => setRootKey(k)} active={rootKey === k} small color={tc} bgColor={bgColor}>{k}</ABtn>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <span style={{ fontSize: '7px', opacity: 0.35, letterSpacing: '0.1em' }}>OCT</span>
              <button onClick={() => setOctaveShift(Math.max(-2, octaveShift - 1))} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 3px' }}>-</button>
              <div className="flex-1 text-center" style={{ fontSize: '11px', textShadow: `0 0 6px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)` }}>
                {octaveShift > 0 ? `+${octaveShift}` : octaveShift}
              </div>
              <button onClick={() => setOctaveShift(Math.min(2, octaveShift + 1))} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 3px' }}>+</button>
            </div>
          </div>

          <Divider color={tc} />

          {/* Tools — always visible, compact 3-col */}
          <div>
            <Label color={tc}>TOOLS</Label>
            <div className="grid grid-cols-3 gap-1">
              <ABtn onClick={() => setTool('draw')} active={tool === 'draw'} small color={tc} bgColor={bgColor}>DRW</ABtn>
              <ABtn onClick={() => setTool('erase')} active={tool === 'erase'} small color={tc} bgColor={bgColor}>ERS</ABtn>
              <ABtn onClick={() => setTool('line')} active={tool === 'line'} small color={tc} bgColor={bgColor}>LIN</ABtn>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <ABtn onClick={() => gridRef.current?.fill()} small color={tc} bgColor={bgColor}>FILL</ABtn>
              <ABtn onClick={handleClear} small color={tc} bgColor={bgColor}>CLR</ABtn>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <ABtn onClick={() => gridRef.current?.undo()} small color={tc} bgColor={bgColor}>UNDO</ABtn>
              <ABtn onClick={() => gridRef.current?.redo()} small color={tc} bgColor={bgColor}>REDO</ABtn>
            </div>
          </div>

          <Divider color={tc} />

          {/* Preset — compact, always visible */}
          <div>
            <Label color={tc}>PRESET</Label>
            <div className="flex items-center gap-1">
              <button onClick={() => cyclePreset(-1)} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 2px' }}>&#9664;</button>
              <div className="flex-1 text-center" style={{ fontSize: '8px', padding: '2px 0', border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.03)`, textTransform: 'uppercase', borderRadius: 2 }}>
                {PRESETS[presetIdx]}
              </div>
              <button onClick={() => cyclePreset(1)} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 2px' }}>&#9654;</button>
            </div>
          </div>

          <Divider color={tc} />

          {/* Color — collapsed by default */}
          <Section title="COLOR" defaultOpen={false} color={tc} bgColor={bgColor}>
            <div className="flex items-center gap-1 mb-1.5">
              <ABtn onClick={() => setColorTarget('brush')} active={colorTarget === 'brush'} small color={tc} bgColor={bgColor} className="flex-1">BRUSH</ABtn>
              <ABtn onClick={() => setColorTarget('canvas')} active={colorTarget === 'canvas'} small color={tc} bgColor={bgColor} className="flex-1">CANVAS</ABtn>
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <ABtn
                onClick={() => {
                  if (colorTarget === 'brush') { setBrushColor(brushColor === null ? hslToHex(brushHue, brushSat, brushLit) : null); }
                  else { setCanvasColor(canvasColor === null ? hslToHex(canvasHue, canvasSat, canvasLit) : null); }
                }}
                active={colorTarget === 'brush' ? brushColor !== null : canvasColor !== null}
                small color={tc} bgColor={bgColor} className="flex-1"
              >
                {(colorTarget === 'brush' ? brushColor !== null : canvasColor !== null) ? 'CUSTOM' : 'THEME'}
              </ABtn>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="flex gap-1">
                <div style={{ width: 20, height: 20, borderRadius: 2, background: brushColor || tc, border: `1px solid ${(brushColor || tc)}88`, boxShadow: colorTarget === 'brush' ? `0 0 8px ${(brushColor || tc)}44` : 'none', outline: colorTarget === 'brush' ? `1px solid ${tc}` : 'none', outlineOffset: 1 }} title="Brush" />
                <div style={{ width: 20, height: 20, borderRadius: 2, background: canvasColor || bgColor, border: `1px solid ${(canvasColor || bgColor)}88`, boxShadow: colorTarget === 'canvas' ? `0 0 8px ${tc}44` : 'none', outline: colorTarget === 'canvas' ? `1px solid ${tc}` : 'none', outlineOffset: 1 }} title="Canvas" />
              </div>
              <span style={{ fontSize: '7px', opacity: 0.5 }}>
                {colorTarget === 'brush' ? (brushColor ? brushColor.toUpperCase() : 'THEME') : (canvasColor ? canvasColor.toUpperCase() : 'THEME')}
              </span>
            </div>
            {/* HSL sliders */}
            {[
              { label: 'H', min: 0, max: 359, value: colorTarget === 'brush' ? brushHue : canvasHue, bg: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)', onChange: (v: number) => { if (colorTarget === 'brush') { setBrushHue(v); setBrushColor(hslToHex(v, brushSat, brushLit)); } else { setCanvasHue(v); setCanvasColor(hslToHex(v, canvasSat, canvasLit)); } } },
              { label: 'S', min: 0, max: 100, value: colorTarget === 'brush' ? brushSat : canvasSat, bg: colorTarget === 'brush' ? `linear-gradient(to right, hsl(${brushHue}, 0%, ${brushLit}%), hsl(${brushHue}, 100%, ${brushLit}%))` : `linear-gradient(to right, hsl(${canvasHue}, 0%, ${canvasLit}%), hsl(${canvasHue}, 100%, ${canvasLit}%))`, onChange: (v: number) => { if (colorTarget === 'brush') { setBrushSat(v); setBrushColor(hslToHex(brushHue, v, brushLit)); } else { setCanvasSat(v); setCanvasColor(hslToHex(canvasHue, v, canvasLit)); } } },
              { label: 'L', min: colorTarget === 'canvas' ? 2 : 10, max: colorTarget === 'canvas' ? 100 : 95, value: colorTarget === 'brush' ? brushLit : canvasLit, bg: colorTarget === 'brush' ? `linear-gradient(to right, hsl(${brushHue}, ${brushSat}%, 10%), hsl(${brushHue}, ${brushSat}%, 55%), hsl(${brushHue}, ${brushSat}%, 95%))` : `linear-gradient(to right, hsl(${canvasHue}, ${canvasSat}%, 2%), hsl(${canvasHue}, ${canvasSat}%, 50%), hsl(${canvasHue}, ${canvasSat}%, 100%))`, onChange: (v: number) => { if (colorTarget === 'brush') { setBrushLit(v); setBrushColor(hslToHex(brushHue, brushSat, v)); } else { setCanvasLit(v); setCanvasColor(hslToHex(canvasHue, canvasSat, v)); } } },
            ].map(({ label, min, max, value, bg, onChange }) => (
              <div key={label} className="flex items-center gap-1 mb-1.5">
                <span style={{ fontSize: '7px', opacity: 0.35, width: 12, flexShrink: 0 }}>{label}</span>
                <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" style={{ height: 10, WebkitAppearance: 'none', appearance: 'none', background: bg, borderRadius: 2, outline: 'none', cursor: 'pointer' }} />
              </div>
            ))}
          </Section>

          <Divider color={tc} />

          {/* Grid Size — collapsed by default */}
          <Section title="GRID SIZE" defaultOpen={false} color={tc} bgColor={bgColor}>
            <div className="grid grid-cols-2 gap-1">
              {RESOLUTIONS.map((r, i) => (
                <ABtn key={r.label} onClick={() => { setResolutionIdx(i); setIsPlaying(false); setCurrentCol(0); }} active={resolutionIdx === i} small color={tc} bgColor={bgColor}>{r.label}</ABtn>
              ))}
            </div>
          </Section>

          {/* Signal — takes remaining space */}
          <div className="flex-1 min-h-0 flex flex-col mt-1">
            <Label color={tc}>SIGNAL</Label>
            <div className="flex-1 min-h-0" style={{ border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`, borderRadius: 3 }}>
              <WaveformDisplay getData={getAnalyserData} isPlaying={isPlaying} mode="combined" color={tc} glowColor={glowC} bgColor={bgColor} />
            </div>
          </div>

          <div className="relative mt-1">
            <div className="flex gap-1">
              <ABtn onClick={() => setShowSaveMenu(!showSaveMenu)} className="flex-1" small color={tc} bgColor={bgColor}>SAVE</ABtn>
              <ABtn onClick={handleImport} className="flex-1" small color={tc} bgColor={bgColor}>LOAD</ABtn>
            </div>
            {showSaveMenu && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 flex flex-col gap-0.5 p-1"
                style={{ background: bgColor, border: `1px solid ${tc}33`, borderRadius: 3, boxShadow: `0 0 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`, zIndex: 60 }}
              >
                <ABtn onClick={() => { handleExport(); setShowSaveMenu(false); }} className="w-full" small color={tc} bgColor={bgColor}>SOUND</ABtn>
                <ABtn onClick={() => { handleExportArt(); setShowSaveMenu(false); }} className="w-full" small color={tc} bgColor={bgColor}>ART</ABtn>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER — canvas + mixer ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Canvas area with tone strip */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-hidden flex">
              {/* Tone strip alongside canvas */}
              <ToneStrip
                rows={gridRows}
                rootKey={rootKey}
                octaveShift={octaveShift}
                scale={scale}
                activeNotes={activeNotes}
                currentCol={currentCol}
                isPlaying={isPlaying}
                color={tc}
                bgColor={bgColor}
                glowColor={glowC}
              />
              <div className="flex-1 min-w-0">
                <PixelGrid
                  ref={gridRef}
                  isPlaying={isPlaying}
                  rootKey={rootKey}
                  octaveShift={octaveShift}
                  reverbWet={reverbWet}
                  delayWet={delayWet}
                  delayTime={delayTime}
                  filterFreq={filterFreq}
                  volume={volume}
                  bpm={bpm}
                  currentCol={currentCol}
                  waveform={waveform}
                  attack={attack}
                  release={release}
                  chorusWet={chorusWet}
                  swing={swing}
                  tool={tool}
                  cols={gridCols}
                  rows={gridRows}
                  pan={pan}
                  resonance={resonance}
                  drive={drive}
                  muted={muted}
                  onColTriggered={handleColTriggered}
                  accentColor={tc}
                  accentGlow={glowC}
                  bgColor={canvasBg}
                  brushColor={brushColor || tc}
                />
              </div>
            </div>

            {/* Playback progress */}
            <div className="relative" style={{ height: 2, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.03)`, flexShrink: 0 }}>
              {isPlaying && (
                <div className="absolute top-0 h-full" style={{
                  left: `${(currentCol / gridCols) * 100}%`,
                  width: `${(1 / gridCols) * 100}%`,
                  background: tc,
                  boxShadow: `0 0 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`,
                }} />
              )}
            </div>
          </div>

          {/* ── MIXER STRIP ── */}
          <div style={{ flexShrink: 0, borderTop: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.08)` }}>
            {/* Toggle bar */}
            <button
              onClick={() => setMixerOpen(!mixerOpen)}
              className="w-full flex items-center transition-all"
              style={{
                fontSize: '8px', letterSpacing: '0.12em', padding: '3px 10px',
                color: mixerOpen ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)` : `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
                background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.02)`,
              }}
            >
              <span style={{ fontSize: '6px', marginRight: 6, transition: 'transform 0.15s', transform: mixerOpen ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>{'\u25BC'}</span>
              MIXER
              {!mixerOpen && (
                <span style={{ fontSize: '7px', opacity: 0.4, marginLeft: 8 }}>
                  {waveform.toUpperCase()} &middot; VOL {volume}dB &middot; REV {Math.round(reverbWet*100)}%
                </span>
              )}
            </button>
            {mixerOpen && (
              <MixerStrip
                waveform={waveform}
                setWaveform={setWaveform}
                attack={attack}
                setAttack={setAttack}
                release={release}
                setRelease={setRelease}
                filterFreq={filterFreq}
                setFilterFreq={setFilterFreq}
                reverbWet={reverbWet}
                setReverbWet={setReverbWet}
                delayWet={delayWet}
                setDelayWet={setDelayWet}
                delayTime={delayTime}
                setDelayTime={setDelayTime}
                chorusWet={chorusWet}
                setChorusWet={setChorusWet}
                volume={volume}
                setVolume={setVolume}
                swing={swing}
                setSwing={setSwing}
                pan={pan}
                setPan={setPan}
                resonance={resonance}
                setResonance={setResonance}
                drive={drive}
                setDrive={setDrive}
                muted={muted}
                setMuted={setMuted}
                soloed={soloed}
                setSoloed={setSoloed}
                isPlaying={isPlaying}
                activeNotes={activeNotes}
                color={tc}
                bgColor={bgColor}
                glowColor={glowC}
                dangerColor={theme.danger}
                onTransform={(type) => {
                  const g = gridRef.current?.getGrid();
                  if (!g) return;
                  if (type === 'rev') gridRef.current?.setGrid(g.map(r => [...r].reverse()));
                  else if (type === 'flip') gridRef.current?.setGrid([...g].reverse());
                  else if (type === 'shift') gridRef.current?.setGrid(g.map(r => [...r.slice(1), r[0]]));
                  else if (type === 'scatter') gridRef.current?.setGrid(g.map(r => r.map(c => c && Math.random() > 0.3)));
                  else if (type === 'double') gridRef.current?.setGrid(g.map(r => r.map((c, i) => c || (i > 0 && r[i - 1]))));
                  else if (type === 'thin') gridRef.current?.setGrid(g.map(r => r.map((c, i) => c && i % 2 === 0)));
                }}
              />
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="flex-shrink-0 flex flex-col p-2 gap-1.5 overflow-y-auto" style={{ borderLeft: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`, width: 140 }}>

          {/* Theme selector — always visible, compact */}
          <div>
            <Label color={tc}>THEME</Label>
            <div className="flex gap-1.5 justify-center">
              {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setThemeKey(key)}
                  className="transition-all"
                  style={{ padding: 2, borderRadius: 4, border: themeKey === key ? `1.5px solid ${t.primary}` : '1.5px solid transparent', background: themeKey === key ? `${t.primary}15` : 'transparent' }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: `linear-gradient(135deg, ${t.glow}, ${t.primary})`,
                    boxShadow: themeKey === key ? `0 0 10px ${t.primary}88` : `0 0 3px ${t.primary}44`,
                  }} />
                </button>
              ))}
            </div>
            {/* Invert toggle */}
            <button
              onClick={() => setInverted(!inverted)}
              className="w-full flex items-center justify-between mt-2 transition-all"
              style={{ fontSize: '7px', letterSpacing: '0.1em', padding: '3px 6px', borderRadius: 3, border: `1px solid ${inverted ? tc : `${tc}22`}`, background: inverted ? `${tc}15` : 'transparent', color: tc }}
            >
              <span style={{ opacity: 0.5 }}>INVERT</span>
              <div style={{ width: 22, height: 10, borderRadius: 5, padding: 1, background: inverted ? tc : `${tc}22`, display: 'flex', alignItems: 'center', justifyContent: inverted ? 'flex-end' : 'flex-start', transition: 'all 0.15s' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: inverted ? bgColor : tc, boxShadow: inverted ? `0 0 4px ${tc}` : 'none', transition: 'all 0.15s' }} />
              </div>
            </button>
          </div>

          <Divider color={tc} />

          {/* XY Pad — collapsible, open by default */}
          <Section title="XY PAD" defaultOpen={true} color={tc} bgColor={bgColor}>
            <div className="flex gap-0.5 mb-1.5">
              {(['filter', 'space', 'shape'] as const).map(m => (
                <ABtn key={m} onClick={() => setXyMode(m)} active={xyMode === m} small color={tc} bgColor={bgColor} className="flex-1">
                  {m === 'filter' ? 'FLT' : m === 'space' ? 'SPC' : 'SHP'}
                </ABtn>
              ))}
            </div>
            <div style={{ height: 110, border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`, borderRadius: 3 }}>
              <XYPad
                xValue={xyX} yValue={xyY}
                onXChange={handleXyXChange} onYChange={handleXyYChange}
                xLabel={xyMode === 'filter' ? 'CUTOFF' : xyMode === 'space' ? 'DELAY' : 'ATTACK'}
                yLabel={xyMode === 'filter' ? 'REVERB' : xyMode === 'space' ? 'CHORUS' : 'RELEASE'}
                color={tc} glowColor={glowC} bgColor={bgColor}
              />
            </div>
            <div className="flex justify-between mt-0.5" style={{ fontSize: '6px', opacity: 0.25 }}>
              <span>{xyMode === 'filter' ? `CUT ${filterFreq >= 1000 ? `${(filterFreq/1000).toFixed(1)}k` : filterFreq}` : xyMode === 'space' ? `DLY ${Math.round(delayWet*100)}%` : `ATK ${attack.toFixed(2)}`}</span>
              <span>{xyMode === 'filter' ? `REV ${Math.round(reverbWet*100)}%` : xyMode === 'space' ? `CHR ${Math.round(chorusWet*100)}%` : `REL ${release.toFixed(1)}`}</span>
            </div>
          </Section>

          <Divider color={tc} />

          {/* Mood Grid — collapsible, collapsed by default */}
          <Section title="MOOD GRID" defaultOpen={false} color={tc} bgColor={bgColor}>
            <MoodGrid color={tc} glowColor={glowC} bgColor={bgColor} onMoodChange={handleMoodChange} />
          </Section>

          <Divider color={tc} />

          {/* Scale — collapsible, collapsed by default */}
          <Section title={`SCALE: ${rootKey} PENTA`} defaultOpen={false} color={tc} bgColor={bgColor}>
            <div className="flex flex-wrap gap-1">
              {scale.map((note: string, i: number) => (
                <div key={i} style={{
                  fontSize: '9px', padding: '2px 5px',
                  border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
                  background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
                  borderRadius: 2, textShadow: `0 0 4px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
                }}>{note}</div>
              ))}
            </div>
          </Section>

          {/* Minimal status at bottom */}
          <div className="mt-auto pt-2" style={{ fontSize: '7px', opacity: 0.25, textAlign: 'center' }}>
            {noteCount} notes &middot; {((noteCount / (gridCols * gridRows)) * 100).toFixed(0)}% fill
          </div>
        </div>
      </div>

      {/* ═══ INSTRUMENTS PANEL ═══ */}
      <div style={{ borderTop: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`, flexShrink: 0 }}>
        <div className="flex items-center" style={{ background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.02)` }}>
          <button
            onClick={() => setInstrumentsOpen(!instrumentsOpen)}
            className="transition-all"
            style={{
              fontSize: '8px', letterSpacing: '0.12em', padding: '4px 14px',
              color: instrumentsOpen ? bgColor : `rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`,
              background: instrumentsOpen ? tc : 'transparent',
            }}
          >
            {instrumentsOpen ? '\u25BC INSTRUMENTS' : '\u25B2 INSTRUMENTS'}
          </button>
          <div className="flex-1" />
          {instrumentsOpen && (
            <div className="flex items-center gap-1 pr-3" style={{ fontSize: '7px', opacity: 0.25, color: tc }}>
              <span>DRUMS + KEYBOARD</span>
            </div>
          )}
        </div>

        {instrumentsOpen && (
          <div className="flex" style={{ height: 220, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.01)` }}>
            {/* Drums section — 60% */}
            <div className="flex flex-col" style={{ flex: '0 0 60%', borderRight: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`, padding: '10px 14px' }}>
              <DrumMachine bpm={bpm} isPlaying={isPlaying} color={tc} glowColor={theme.glow} dangerColor={theme.danger} bgColor={bgColor} muted={soloed} />
            </div>
            {/* Keyboard section — 40% */}
            <div className="flex flex-col" style={{ flex: '0 0 40%', padding: '10px 14px' }}>
              <RetroKeyboard octave={4} color={tc} glowColor={theme.glow} dangerColor={theme.danger} bgColor={bgColor} muted={soloed} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ KEYBOARD SHORTCUTS OVERLAY ═══ */}
      {showShortcuts && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: bgColor,
              border: `1px solid ${tc}33`,
              borderRadius: 6,
              padding: '20px 28px',
              maxWidth: 480,
              width: '90%',
              boxShadow: `0 0 40px rgba(${rgb.r},${rgb.g},${rgb.b},0.15), inset 0 0 30px rgba(${rgb.r},${rgb.g},${rgb.b},0.02)`,
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: '10px', letterSpacing: '0.2em', color: tc }}>KEYBOARD SHORTCUTS</span>
              <button
                onClick={() => setShowShortcuts(false)}
                style={{ fontSize: '12px', color: tc, opacity: 0.4, padding: '2px 6px' }}
              >ESC</button>
            </div>

            {[
              {
                title: 'TRANSPORT',
                keys: [
                  ['Space', 'Play / Stop'],
                  ['Escape', 'Stop'],
                ],
              },
              {
                title: 'DRAWING',
                keys: [
                  ['D', 'Draw tool'],
                  ['E', 'Erase tool'],
                  ['L', 'Line tool'],
                  ['Ctrl+Z', 'Undo'],
                  ['Ctrl+Shift+Z', 'Redo'],
                ],
              },
              {
                title: 'DRUMS (when panel open)',
                keys: [
                  ['1-8', 'Trigger drum pads'],
                ],
              },
              {
                title: 'KEYBOARD (when panel open)',
                keys: [
                  ['Z X C V B N M', 'White keys'],
                  ['S D  G H J', 'Black keys'],
                  ['\u2190 \u2192', 'Change octave'],
                  ['\u2191 \u2193', 'Change sound preset'],
                ],
              },
              {
                title: 'GENERAL',
                keys: [
                  ['?', 'Toggle this overlay'],
                ],
              },
            ].map((section) => (
              <div key={section.title} className="mb-3">
                <div style={{ fontSize: '7px', letterSpacing: '0.15em', color: tc, opacity: 0.35, marginBottom: 4 }}>
                  {section.title}
                </div>
                {section.keys.map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-3 mb-1">
                    <span style={{
                      fontSize: '8px', padding: '2px 6px', minWidth: 70,
                      background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`,
                      border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`,
                      borderRadius: 3, color: tc, textAlign: 'center',
                    }}>{key}</span>
                    <span style={{ fontSize: '8px', color: tc, opacity: 0.5 }}>{desc}</span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ fontSize: '7px', color: tc, opacity: 0.2, textAlign: 'center', marginTop: 8 }}>
              Click backdrop or press ESC to close
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        input[type="range"] {
          min-width: 0;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 6px;
          height: 12px;
          background: #ffffff;
          border-radius: 1px;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(255,255,255,0.5);
        }
        input[type="range"]::-moz-range-thumb {
          width: 6px;
          height: 12px;
          background: #ffffff;
          border: none;
          border-radius: 1px;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(255,255,255,0.5);
        }
        /* Thin scrollbar for sidebars */
        .overflow-y-auto::-webkit-scrollbar {
          width: 3px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}