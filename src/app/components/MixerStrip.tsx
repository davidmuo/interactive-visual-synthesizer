import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

// ── Section divider with label ──
function SectionDiv({ color }: { label?: string; color: string }) {
  const rgb = hexToRgb(color);
  return (
    <div className="flex-shrink-0 self-stretch flex items-center" style={{ width: 1 }}>
      <div style={{ width: 1, height: '70%', background: `linear-gradient(to bottom, transparent, rgba(${rgb.r},${rgb.g},${rgb.b},0.15), transparent)` }} />
    </div>
  );
}

// ── Section label ──
function SLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ fontSize: '6px', letterSpacing: '0.18em', color, opacity: 0.3, textTransform: 'uppercase' as const }}>{children}</div>;
}

// ── Mini button ──
function MBtn({ children, onClick, active, color, bgColor, danger }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; color: string; bgColor: string; danger?: boolean;
}) {
  const c = danger ? '#ff4444' : color;
  return (
    <button
      onClick={onClick}
      className="transition-all duration-75 active:translate-y-[1px]"
      style={{
        fontSize: '7px', letterSpacing: '0.08em', padding: '2px 5px',
        color: active ? bgColor : c,
        background: active ? c : `${c}08`,
        border: `1px solid ${active ? c : `${c}30`}`,
        boxShadow: active ? `0 0 8px ${c}40` : 'none',
        borderRadius: 3, whiteSpace: 'nowrap' as const,
      }}
    >{children}</button>
  );
}

// ── Enhanced Fader ──
function MixFader({ label, value, min, max, step = 1, displayValue, onChange, height = 52, color, warning }:
  { label: string; value: number; min: number; max: number; step?: number; displayValue?: string; onChange: (v: number) => void; height?: number; color: string; warning?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const normalized = (value - min) / (max - min);
  const rgb = hexToRgb(color);
  const warnRgb = warning && normalized > 0.85 ? hexToRgb('#ff4444') : null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); setIsDragging(true); }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => { e.preventDefault(); setIsDragging(true); }, []);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
      const n = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      let v = min + n * (max - min);
      v = Math.round(v / step) * step;
      onChange(Math.max(min, Math.min(max, v)));
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [isDragging, min, max, step, onChange]);

  const thumbY = (1 - normalized) * (height - 12);
  const fillColor = warnRgb ? `rgb(${warnRgb.r},${warnRgb.g},${warnRgb.b})` : color;

  return (
    <div className="flex flex-col items-center gap-1" style={{ userSelect: 'none', minWidth: 24 }}>
      <span style={{ fontSize: '6px', letterSpacing: '0.12em', color, opacity: 0.5 }}>{label}</span>
      <div ref={trackRef} className="relative cursor-ns-resize" style={{ width: 24, height, touchAction: 'none' }} onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
        {/* Track groove */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{
          width: 4, height: '100%', borderRadius: 2,
          background: `linear-gradient(to bottom, rgba(${rgb.r},${rgb.g},${rgb.b},0.04), rgba(${rgb.r},${rgb.g},${rgb.b},0.08))`,
          border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`,
        }} />
        {/* Fill */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0" style={{
          width: 4, borderRadius: 2, height: `${normalized * 100}%`,
          background: `linear-gradient(to top, ${fillColor}, ${fillColor}88)`,
          boxShadow: isDragging ? `0 0 6px ${fillColor}44` : 'none',
        }} />
        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} className="absolute" style={{
            right: 0, top: (1 - t) * (height - 12) + 5, width: 3, height: 1,
            background: `rgba(${rgb.r},${rgb.g},${rgb.b},${t === 0.5 ? 0.2 : 0.1})`,
          }} />
        ))}
        {/* Thumb */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{
          width: 20, height: 10, top: thumbY, borderRadius: 2,
          border: `1px solid ${isDragging ? fillColor : `${color}88`}`,
          background: isDragging
            ? `linear-gradient(to bottom, rgba(${rgb.r},${rgb.g},${rgb.b},0.35), rgba(${rgb.r},${rgb.g},${rgb.b},0.15))`
            : `linear-gradient(to bottom, rgba(${rgb.r},${rgb.g},${rgb.b},0.15), rgba(${rgb.r},${rgb.g},${rgb.b},0.06))`,
          boxShadow: isDragging ? `0 0 8px ${fillColor}55, inset 0 1px 0 ${fillColor}22` : `inset 0 1px 0 rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`,
          transition: isDragging ? 'none' : 'box-shadow 0.15s',
        }}>
          {/* Grip lines */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-px">
            <div style={{ width: 8, height: 1, background: `${color}66` }} />
            <div style={{ width: 8, height: 1, background: `${color}33` }} />
          </div>
        </div>
      </div>
      <div style={{
        fontSize: '7px', color: warnRgb ? `rgb(${warnRgb.r},${warnRgb.g},${warnRgb.b})` : color,
        padding: '1px 3px', borderRadius: 2, minWidth: 26, textAlign: 'center' as const,
        background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
        border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`,
      }}>
        {displayValue ?? value}
      </div>
    </div>
  );
}

// ── Enhanced Knob ──
function MixKnob({ label, value, min, max, step = 1, displayValue, onChange, size = 36, color, bgColor }:
  { label: string; value: number; min: number; max: number; step?: number; displayValue?: string; onChange: (v: number) => void; size?: number; color: string; bgColor: string }) {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);
  const rgb = hexToRgb(color);
  const norm = (value - min) / (max - min);
  const angle = norm * 270 - 135;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); setIsDragging(true);
    startYRef.current = e.clientY; startValRef.current = value;
  }, [value]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); setIsDragging(true);
    startYRef.current = e.touches[0]?.clientY ?? 0; startValRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
      const dy = startYRef.current - clientY;
      let v = startValRef.current + dy * ((max - min) / 120);
      v = Math.round(v / step) * step;
      onChange(Math.max(min, Math.min(max, v)));
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [isDragging, min, max, step, onChange]);

  // Arc path for value indicator
  const r = size / 2 - 4;
  const cx = size / 2, cy = size / 2;
  const startAngle = -225;
  const sweepAngle = norm * 270;

  const polarToCartesian = (cx: number, cy: number, r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ userSelect: 'none' }}>
      <span style={{ fontSize: '6px', letterSpacing: '0.12em', color, opacity: 0.5 }}>{label}</span>
      <div onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} className="relative cursor-ns-resize" style={{ width: size + 6, height: size + 6, touchAction: 'none' }}>
        <svg width={size + 6} height={size + 6} viewBox={`-3 -3 ${size + 6} ${size + 6}`}>
          {/* Outer ring glow */}
          {isDragging && (
            <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={`rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`} strokeWidth={4} />
          )}
          {/* Background arc track */}
          <path d={describeArc(cx, cy, r, startAngle, startAngle + 270)} fill="none"
            stroke={`rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`} strokeWidth={2.5} strokeLinecap="round" />
          {/* Value arc */}
          {norm > 0.01 && (
            <path d={describeArc(cx, cy, r, startAngle, startAngle + sweepAngle)} fill="none"
              stroke={color} strokeWidth={2.5} strokeLinecap="round"
              style={{ filter: isDragging ? `drop-shadow(0 0 3px ${color})` : 'none' }} />
          )}
          {/* Knob body */}
          <circle cx={cx} cy={cy} r={r - 4} fill={bgColor}
            stroke={`rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`} strokeWidth={1.5} />
          {/* Inner gradient */}
          <circle cx={cx} cy={cy} r={r - 5} fill={`rgba(${rgb.r},${rgb.g},${rgb.b},0.03)`} />
          {/* Pointer */}
          <line
            x1={cx} y1={cy}
            x2={cx + Math.sin(angle * Math.PI / 180) * (r - 7)}
            y2={cy - Math.cos(angle * Math.PI / 180) * (r - 7)}
            stroke={color} strokeWidth={2} strokeLinecap="round"
          />
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={1.5} fill={color} />
        </svg>
      </div>
      <div style={{
        fontSize: '7px', color, padding: '1px 3px', borderRadius: 2,
        minWidth: 28, textAlign: 'center' as const,
        background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
        border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`,
      }}>
        {displayValue ?? value}
      </div>
    </div>
  );
}

// ── Stereo Level Meter ──
function StereoMeter({ isPlaying, activeNotes, color, dangerColor, glowColor }: {
  isPlaying: boolean; activeNotes: string[]; color: string; dangerColor: string; glowColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef([0, 0]); // L, R
  const peaksRef = useRef([0, 0]);
  const peakDecayRef = useRef([0, 0]);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgb = hexToRgb(color);
    const dangerRgb = hexToRgb(dangerColor);
    const glowRgb = hexToRgb(glowColor);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Calculate target levels
      const active = isPlaying && activeNotes.length > 0;
      const targetL = active ? 0.3 + Math.min(0.7, activeNotes.length * 0.12) + Math.random() * 0.15 : 0;
      const targetR = active ? 0.3 + Math.min(0.7, activeNotes.length * 0.12) + Math.random() * 0.15 : 0;

      levelsRef.current[0] += (targetL - levelsRef.current[0]) * 0.2;
      levelsRef.current[1] += (targetR - levelsRef.current[1]) * 0.2;

      // Peak hold
      for (let ch = 0; ch < 2; ch++) {
        if (levelsRef.current[ch] > peaksRef.current[ch]) {
          peaksRef.current[ch] = levelsRef.current[ch];
          peakDecayRef.current[ch] = 40; // hold frames
        } else if (peakDecayRef.current[ch] > 0) {
          peakDecayRef.current[ch]--;
        } else {
          peaksRef.current[ch] -= 0.015;
          if (peaksRef.current[ch] < 0) peaksRef.current[ch] = 0;
        }
      }

      const barW = 5;
      const gap = 3;
      const totalW = barW * 2 + gap;
      const startX = (w - totalW) / 2;
      const segments = 16;
      const segH = (h - 12) / segments;
      const segGap = 1;

      // Draw channel labels
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`;
      ctx.font = '5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('L', startX + barW / 2, h - 1);
      ctx.fillText('R', startX + barW + gap + barW / 2, h - 1);

      for (let ch = 0; ch < 2; ch++) {
        const x = startX + ch * (barW + gap);
        const level = levelsRef.current[ch];
        const peak = peaksRef.current[ch];
        const litSegs = Math.floor(level * segments);

        for (let s = 0; s < segments; s++) {
          const y = (segments - 1 - s) * segH + 2;
          const fraction = s / segments;
          const isPeak = Math.floor(peak * segments) === s && peak > 0.05;

          let segColor: string;
          if (fraction > 0.87) {
            segColor = s < litSegs ? `rgb(${dangerRgb.r},${dangerRgb.g},${dangerRgb.b})` : `rgba(${dangerRgb.r},${dangerRgb.g},${dangerRgb.b},0.06)`;
          } else if (fraction > 0.7) {
            segColor = s < litSegs ? `rgb(${glowRgb.r},${glowRgb.g},${glowRgb.b})` : `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},0.06)`;
          } else {
            segColor = s < litSegs ? color : `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`;
          }

          ctx.fillStyle = segColor;
          ctx.fillRect(x, y, barW, segH - segGap);

          // Glow on lit segments
          if (s < litSegs && fraction > 0.7) {
            ctx.shadowBlur = 4;
            ctx.shadowColor = segColor;
            ctx.fillRect(x, y, barW, segH - segGap);
            ctx.shadowBlur = 0;
          }

          // Peak indicator
          if (isPeak) {
            ctx.fillStyle = fraction > 0.87
              ? `rgb(${dangerRgb.r},${dangerRgb.g},${dangerRgb.b})`
              : color;
            ctx.fillRect(x, y, barW, 1);
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, activeNotes, color, dangerColor, glowColor]);

  return (
    <canvas
      ref={canvasRef}
      width={24}
      height={60}
      style={{ width: 24, height: 60 }}
    />
  );
}

// ── Pan Knob (tiny) ──
function PanDot({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startValRef = useRef(0);
  const rgb = hexToRgb(color);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); setIsDragging(true);
    startXRef.current = e.clientX; startValRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => {
      const dx = e.clientX - startXRef.current;
      let v = startValRef.current + dx / 40;
      v = Math.max(-1, Math.min(1, v));
      onChange(Math.round(v * 20) / 20);
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDragging, onChange]);

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ userSelect: 'none' }}>
      <span style={{ fontSize: '5px', letterSpacing: '0.12em', color, opacity: 0.3 }}>PAN</span>
      <div
        onMouseDown={handleMouseDown}
        className="relative cursor-ew-resize"
        style={{
          width: 30, height: 8, borderRadius: 4,
          background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`,
          border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`,
        }}
      >
        {/* Center mark */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: 1, height: '100%', background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)` }} />
        {/* Dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: `${((value + 1) / 2) * 100}%`, transform: 'translate(-50%, -50%)',
            width: 6, height: 6, borderRadius: '50%',
            background: color, boxShadow: `0 0 4px ${color}66`,
          }}
        />
      </div>
      <span style={{ fontSize: '5px', color, opacity: 0.3 }}>
        {value === 0 ? 'C' : value < 0 ? `L${Math.abs(Math.round(value * 100))}` : `R${Math.round(value * 100)}`}
      </span>
    </div>
  );
}

// ── WAVEFORMS ──
const WAVEFORMS = ['sine', 'triangle', 'fmsine', 'amsine'] as const;
const WAVEFORM_LABELS: Record<string, string> = { sine: 'SIN', triangle: 'TRI', fmsine: 'FM', amsine: 'AM' };
const DELAY_TIMES = ['16n', '8n', '4n', '2n'] as const;
const DELAY_LABELS: Record<string, string> = { '16n': '1/16', '8n': '1/8', '4n': '1/4', '2n': '1/2' };

// ── Waveform preview ──
function WavePreview({ waveform, color, active }: { waveform: string; color: string; active: boolean }) {
  const rgb = hexToRgb(color);
  const points = useMemo(() => {
    const pts: string[] = [];
    const w = 28, h = 14;
    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let y = 0;
      if (waveform === 'sine') y = Math.sin(t * Math.PI * 2.5);
      else if (waveform === 'triangle') y = Math.abs((t * 2.5) % 1 - 0.5) * 4 - 1;
      else if (waveform === 'fmsine') y = Math.sin(t * Math.PI * 2.5 + Math.sin(t * Math.PI * 7) * 0.5);
      else if (waveform === 'amsine') y = Math.sin(t * Math.PI * 2.5) * (0.5 + 0.5 * Math.sin(t * Math.PI * 4));
      pts.push(`${x},${h / 2 - y * (h / 2 - 1)}`);
    }
    return pts.join(' ');
  }, [waveform]);

  return (
    <svg width={28} height={14} viewBox="0 0 28 14" style={{ display: 'block' }}>
      {/* Center line */}
      <line x1={0} y1={7} x2={28} y2={7} stroke={`rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`} strokeWidth={0.5} />
      <polyline
        points={points}
        fill="none"
        stroke={active ? color : `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`}
        strokeWidth={active ? 1.5 : 1}
        style={{ filter: active ? `drop-shadow(0 0 2px ${color})` : 'none' }}
      />
    </svg>
  );
}

// ══════════════════════════════════════════
// ── MAIN MIXER STRIP COMPONENT ──
// ══════════════════════════════════════════

export interface MixerStripProps {
  waveform: typeof WAVEFORMS[number];
  setWaveform: (w: typeof WAVEFORMS[number]) => void;
  attack: number; setAttack: (v: number) => void;
  release: number; setRelease: (v: number) => void;
  filterFreq: number; setFilterFreq: (v: number) => void;
  reverbWet: number; setReverbWet: (v: number) => void;
  delayWet: number; setDelayWet: (v: number) => void;
  chorusWet: number; setChorusWet: (v: number) => void;
  delayTime: string; setDelayTime: (v: string) => void;
  volume: number; setVolume: (v: number) => void;
  swing: number; setSwing: (v: number) => void;
  pan: number; setPan: (v: number) => void;
  resonance: number; setResonance: (v: number) => void;
  drive: number; setDrive: (v: number) => void;
  muted: boolean; setMuted: (v: boolean) => void;
  soloed: boolean; setSoloed: (v: boolean) => void;
  isPlaying: boolean;
  activeNotes: string[];
  color: string;
  glowColor: string;
  bgColor: string;
  dangerColor: string;
  onTransform: (type: 'rev' | 'flip' | 'shift' | 'scatter' | 'double' | 'thin') => void;
}

export function MixerStrip({
  waveform, setWaveform,
  attack, setAttack, release, setRelease,
  filterFreq, setFilterFreq,
  reverbWet, setReverbWet, delayWet, setDelayWet,
  chorusWet, setChorusWet,
  delayTime, setDelayTime,
  volume, setVolume, swing, setSwing,
  pan, setPan, resonance, setResonance,
  drive, setDrive, muted, setMuted, soloed, setSoloed,
  isPlaying, activeNotes,
  color, glowColor, bgColor, dangerColor,
  onTransform,
}: MixerStripProps) {
  const rgb = hexToRgb(color);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const inner = innerRef.current;
      if (!inner) return;
      const containerW = container.clientWidth;
      const innerW = inner.scrollWidth;
      if (innerW > 0 && containerW < innerW) {
        setScale(Math.max(0.55, containerW / innerW));
      } else {
        setScale(1);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Calculate dynamic glow based on activity
  const activityGlow = isPlaying && activeNotes.length > 0
    ? `0 -1px 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`
    : 'none';

  return (
    <div ref={containerRef} style={{
      borderTop: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
      flexShrink: 0,
      background: `linear-gradient(to bottom, rgba(${rgb.r},${rgb.g},${rgb.b},0.02), rgba(${rgb.r},${rgb.g},${rgb.b},0.005))`,
      boxShadow: activityGlow,
      overflow: 'hidden',
    }}>
      {/* Decorative top line */}
      <div style={{
        height: 1,
        background: `linear-gradient(to right, transparent, rgba(${rgb.r},${rgb.g},${rgb.b},0.08) 20%, rgba(${rgb.r},${rgb.g},${rgb.b},0.15) 50%, rgba(${rgb.r},${rgb.g},${rgb.b},0.08) 80%, transparent)`,
      }} />

      <div style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: scale < 1 ? `${100 / scale}%` : '100%',
        height: scale < 1 ? 'auto' : undefined,
      }}>
        <div ref={innerRef} className="flex items-stretch justify-between px-4 py-2" style={{ gap: 0, minWidth: 700 }}>
          {/* ── OSCILLATOR SECTION ── */}
          <div className="flex flex-col gap-1 items-center" style={{ justifyContent: 'flex-start', flex: '1 1 0', minWidth: 0 }}>
            <SLabel color={color}>OSCILLATOR</SLabel>
            <div className="flex gap-1 flex-1 items-center justify-center">
              {WAVEFORMS.map(w => (
                <button
                  key={w}
                  onClick={() => setWaveform(w)}
                  className="flex flex-col items-center gap-0.5 transition-all"
                  style={{
                    padding: '2px 3px', borderRadius: 3,
                    border: `1px solid ${waveform === w ? color : `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`}`,
                    background: waveform === w ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)` : 'transparent',
                    boxShadow: waveform === w ? `0 0 8px ${color}30, inset 0 0 8px ${color}08` : 'none',
                  }}
                >
                  <WavePreview waveform={w} color={color} active={waveform === w} />
                  <span style={{
                    fontSize: '6px', letterSpacing: '0.1em',
                    color: waveform === w ? color : `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
                  }}>{WAVEFORM_LABELS[w]}</span>
                </button>
              ))}
            </div>
          </div>

          <SectionDiv color={color} />

          {/* ── ENVELOPE + FILTER ── */}
          <div className="flex flex-col gap-1 items-center" style={{ justifyContent: 'flex-start', flex: '1 1 0', minWidth: 0 }}>
            <SLabel color={color}>ENVELOPE &amp; FILTER</SLabel>
            <div className="flex items-end gap-2 justify-center">
              <MixFader label="ATK" value={attack} min={0.01} max={0.5} step={0.01}
                displayValue={attack.toFixed(2)} onChange={setAttack} height={50} color={color} />
              <MixFader label="REL" value={release} min={0.1} max={2} step={0.05}
                displayValue={release.toFixed(1)} onChange={setRelease} height={50} color={color} />
              <MixFader label="CUT" value={filterFreq} min={200} max={8000} step={100}
                displayValue={filterFreq >= 1000 ? `${(filterFreq / 1000).toFixed(1)}k` : `${filterFreq}`}
                onChange={setFilterFreq} height={50} color={color} />
              <MixFader label="RES" value={resonance} min={0} max={100} step={1}
                displayValue={`${resonance}%`} onChange={setResonance} height={50} color={color} />
            </div>
          </div>

          <SectionDiv color={color} />

          {/* ── EFFECTS ── */}
          <div className="flex flex-col gap-1 items-center" style={{ justifyContent: 'flex-start', flex: '1.2 1 0', minWidth: 0 }}>
            <SLabel color={color}>EFFECTS</SLabel>
            <div className="flex items-end gap-2 justify-center">
              <MixKnob label="REV" value={Math.round(reverbWet * 100)} min={0} max={100}
                displayValue={`${Math.round(reverbWet * 100)}%`} onChange={v => setReverbWet(v / 100)}
                size={32} color={color} bgColor={bgColor} />
              <MixKnob label="DLY" value={Math.round(delayWet * 100)} min={0} max={100}
                displayValue={`${Math.round(delayWet * 100)}%`} onChange={v => setDelayWet(v / 100)}
                size={32} color={color} bgColor={bgColor} />
              <MixKnob label="CHR" value={Math.round(chorusWet * 100)} min={0} max={100}
                displayValue={`${Math.round(chorusWet * 100)}%`} onChange={v => setChorusWet(v / 100)}
                size={32} color={color} bgColor={bgColor} />
              <MixKnob label="DRV" value={drive} min={0} max={100}
                displayValue={`${drive}%`} onChange={setDrive}
                size={32} color={color} bgColor={bgColor} />
            </div>
            {/* Delay time selector */}
            <div className="flex items-center gap-1 justify-center">
              <span style={{ fontSize: '5px', opacity: 0.25, color, letterSpacing: '0.1em' }}>DLY TIME</span>
              <div className="flex gap-0.5">
                {DELAY_TIMES.map(t => (
                  <MBtn key={t} onClick={() => setDelayTime(t)} active={delayTime === t} color={color} bgColor={bgColor}>
                    {DELAY_LABELS[t]}
                  </MBtn>
                ))}
              </div>
            </div>
          </div>

          <SectionDiv color={color} />

          {/* ── MASTER SECTION ── */}
          <div className="flex flex-col gap-1 items-center" style={{ justifyContent: 'flex-start', flex: '1 1 0', minWidth: 0 }}>
            <SLabel color={color}>MASTER</SLabel>
            <div className="flex items-start gap-3 justify-center">
              {/* Faders + Pan stacked */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-1">
                  <MixFader label="VOL" value={volume} min={-30} max={0} step={1}
                    displayValue={`${volume}dB`} onChange={setVolume} height={50} color={color} warning />
                  <MixFader label="SWG" value={swing} min={0} max={100} step={5}
                    displayValue={`${swing}%`} onChange={setSwing} height={50} color={color} />
                </div>
                <PanDot value={pan} onChange={setPan} color={color} />
              </div>

              {/* Level meter + M/S stacked */}
              <div className="flex flex-col items-center gap-0.5">
                <StereoMeter
                  isPlaying={isPlaying && !muted}
                  activeNotes={activeNotes}
                  color={color}
                  dangerColor={dangerColor}
                  glowColor={glowColor}
                />
                <div className="flex gap-0.5">
                  <MBtn onClick={() => setMuted(!muted)} active={muted} color={dangerColor} bgColor={bgColor} danger>M</MBtn>
                  <MBtn onClick={() => setSoloed(!soloed)} active={soloed} color={glowColor} bgColor={bgColor}>S</MBtn>
                </div>
              </div>
            </div>
          </div>

          <SectionDiv color={color} />

          {/* ── TRANSFORM ── */}
          <div className="flex flex-col gap-1 items-center" style={{ justifyContent: 'flex-start', flex: '0.7 1 0', minWidth: 0 }}>
            <SLabel color={color}>TRANSFORM</SLabel>
            <div className="grid grid-cols-3 gap-1">
              <MBtn onClick={() => onTransform('rev')} color={color} bgColor={bgColor}>REV</MBtn>
              <MBtn onClick={() => onTransform('flip')} color={color} bgColor={bgColor}>FLP</MBtn>
              <MBtn onClick={() => onTransform('shift')} color={color} bgColor={bgColor}>SHF</MBtn>
              <MBtn onClick={() => onTransform('scatter')} color={color} bgColor={bgColor}>SCT</MBtn>
              <MBtn onClick={() => onTransform('double')} color={color} bgColor={bgColor}>DBL</MBtn>
              <MBtn onClick={() => onTransform('thin')} color={color} bgColor={bgColor}>THN</MBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}