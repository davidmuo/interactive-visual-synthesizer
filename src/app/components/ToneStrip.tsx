import { useRef, useEffect, useMemo, useCallback } from 'react';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

const BLACK_KEYS = new Set(['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb']);

interface ToneStripProps {
  rows: number;
  rootKey: string;
  octaveShift: number;
  scale: string[];
  activeNotes: string[];
  currentCol: number;
  isPlaying: boolean;
  color: string;
  bgColor: string;
  glowColor?: string;
}

export function ToneStrip({
  rows,
  rootKey,
  octaveShift,
  scale,
  activeNotes,
  currentCol: _currentCol,
  isPlaying,
  color,
  bgColor,
  glowColor,
}: ToneStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rgb = hexToRgb(color);
  const glowRgb = hexToRgb(glowColor || color);

  // Build note info for every row — matches PixelGrid's rowToNote exactly
  const allNotes = useMemo(() => {
    return Array.from({ length: rows }, (_, r) => {
      const noteIdx = rows - 1 - r;
      const scaleIdx = noteIdx % scale.length;
      const oct = Math.floor(noteIdx / scale.length) + 2 + octaveShift;
      const clampedOct = Math.max(1, Math.min(7, oct));
      const noteName = scale[scaleIdx];
      const fullNote = `${noteName}${clampedOct}`;
      const isRoot = scaleIdx === 0;
      const isBlack = BLACK_KEYS.has(noteName);
      return { noteName, oct: clampedOct, fullNote, isRoot, isBlack, scaleIdx };
    });
  }, [rows, scale, octaveShift]);

  const activeSet = useMemo(() => new Set(activeNotes), [activeNotes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background — match canvas exactly
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const cellH = h / rows;
    const blackKeyW = Math.round(w * 0.6);

    // ── Draw keys ──
    for (let r = 0; r < rows; r++) {
      const info = allNotes[r];
      const y = Math.round(r * cellH);
      const nextY = Math.round((r + 1) * cellH);
      const keyH = nextY - y;
      const isActive = isPlaying && activeSet.has(info.fullNote);

      if (info.isBlack) {
        // Black key
        ctx.fillStyle = isActive
          ? `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},0.35)`
          : 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y, blackKeyW, keyH);
        // Subtle right edge
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`;
        ctx.fillRect(blackKeyW - 1, y, 1, keyH);
      } else {
        // White key
        ctx.fillStyle = isActive
          ? `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},0.18)`
          : info.isRoot
            ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`
            : `rgba(${rgb.r},${rgb.g},${rgb.b},0.025)`;
        ctx.fillRect(0, y, w, keyH);
      }

      // Key border — octave roots are stronger
      if (info.isRoot) {
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`;
        ctx.fillRect(0, y, w, 1);
      } else {
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.05)`;
        ctx.fillRect(0, y, w, 0.5);
      }

      // Active glow bar
      if (isActive) {
        ctx.save();
        ctx.shadowColor = glowColor || color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = glowColor || color;
        ctx.fillRect(0, y, 3, keyH);
        ctx.restore();
      }
    }

    // ── Labels ──
    // Use a single combined label like "C4", "F#3" on one line
    // Only place labels where they won't overlap
    const fontSize = cellH >= 14 ? 9 : cellH >= 10 ? 8 : cellH >= 7 ? 7 : 6;
    const labelH = fontSize + 2; // approximate rendered height of one label
    const minGap = labelH + 1; // minimum vertical gap between label centers

    // Prioritize: roots > mid-scale > all others
    type Candidate = { r: number; priority: number };
    const candidates: Candidate[] = [];
    const midIdx = Math.floor(scale.length / 2);
    for (let r = 0; r < rows; r++) {
      const info = allNotes[r];
      if (info.isRoot) candidates.push({ r, priority: 0 });
      else if (info.scaleIdx === midIdx) candidates.push({ r, priority: 1 });
      else candidates.push({ r, priority: 2 });
    }
    candidates.sort((a, b) => a.priority - b.priority || a.r - b.r);

    const placedYs: number[] = [];
    const labelRows: number[] = [];

    for (const c of candidates) {
      const yCenter = c.r * cellH + cellH / 2;
      if (placedYs.every((py) => Math.abs(py - yCenter) >= minGap)) {
        placedYs.push(yCenter);
        labelRows.push(c.r);
      }
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    for (const r of labelRows) {
      const info = allNotes[r];
      const yCenter = Math.round(r * cellH + cellH / 2);
      const isActive = isPlaying && activeSet.has(info.fullNote);

      const label = `${info.noteName}${info.oct}`;
      const textX = info.isBlack ? blackKeyW - 3 : w - 3;

      // Shadow for active notes
      ctx.shadowColor = isActive ? (glowColor || color) : 'transparent';
      ctx.shadowBlur = isActive ? 6 : 0;

      // Color
      ctx.fillStyle = isActive
        ? (glowColor || color)
        : info.isRoot
          ? color
          : `rgba(${rgb.r},${rgb.g},${rgb.b},0.5)`;

      ctx.font = `${info.isRoot ? 'bold ' : ''}${fontSize}px 'Share Tech Mono', Consolas, monospace`;
      ctx.fillText(label, textX, yCenter);

      ctx.shadowBlur = 0;
    }
  }, [rows, allNotes, activeSet, isPlaying, color, bgColor, glowColor, rgb, glowRgb, scale.length]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 relative select-none"
      style={{ width: 40, overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}