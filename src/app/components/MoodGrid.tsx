import { useRef, useEffect, useState, useCallback } from 'react';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

const GRID_SIZE = 6;
const MOOD_ROWS = [
  { label: 'REV', key: 'reverb' },
  { label: 'DLY', key: 'delay' },
  { label: 'CHR', key: 'chorus' },
  { label: 'CUT', key: 'filter' },
  { label: 'ATK', key: 'attack' },
  { label: 'REL', key: 'release' },
] as const;

export interface MoodValues {
  reverb: number;  // 0-1
  delay: number;   // 0-1
  chorus: number;  // 0-1
  filter: number;  // 0-1
  attack: number;  // 0-1
  release: number; // 0-1
}

interface MoodGridProps {
  color?: string;
  glowColor?: string;
  bgColor?: string;
  onMoodChange?: (values: MoodValues) => void;
}

export function MoodGrid({ color = '#ffb000', glowColor, bgColor = '#0c0c14', onMoodChange }: MoodGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false))
  );
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const phaseRef = useRef(0);
  const mountedRef = useRef(false);

  // Compute per-row intensities
  const getValues = useCallback((g: boolean[][]): MoodValues => {
    const rowCounts = g.map(row => row.filter(Boolean).length);
    return {
      reverb: rowCounts[0] / GRID_SIZE,
      delay: rowCounts[1] / GRID_SIZE,
      chorus: rowCounts[2] / GRID_SIZE,
      filter: rowCounts[3] / GRID_SIZE,
      attack: rowCounts[4] / GRID_SIZE,
      release: rowCounts[5] / GRID_SIZE,
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onMoodChange?.(getValues(grid));
  }, [grid, onMoodChange, getValues]);

  const getCellFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    // Account for label area on the left (24px)
    const labelWidth = 24;
    const gridWidth = rect.width - labelWidth;
    const col = Math.floor(((clientX - rect.left - labelWidth) / gridWidth) * GRID_SIZE);
    const row = Math.floor(((clientY - rect.top) / rect.height) * GRID_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return [row, col] as const;
  }, []);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;
    const [r, c] = cell;
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = !next[r][c];
      return next;
    });
  };

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      const rgb = hexToRgb(color);
      const glow = glowColor || color;

      phaseRef.current += 0.025;
      const phase = phaseRef.current;

      const labelWidth = 24;
      const gridWidth = w - labelWidth;
      const cellW = gridWidth / GRID_SIZE;
      const cellH = h / GRID_SIZE;

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const currentGrid = gridRef.current;

      // Draw row labels
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      ctx.font = "6px 'Share Tech Mono', monospace";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < GRID_SIZE; r++) {
        const y = r * cellH;
        const rowCount = currentGrid[r]?.filter(Boolean).length ?? 0;
        const rowIntensity = rowCount / GRID_SIZE;

        // Row label
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.2 + rowIntensity * 0.6})`;
        ctx.fillText(MOOD_ROWS[r].label, labelWidth - 3, y + cellH / 2 + 1);

        // Row intensity bar (subtle background behind labels)
        if (rowCount > 0) {
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.03)`;
          ctx.fillRect(0, y, labelWidth - 1, cellH);
        }

        // Draw cells
        for (let c = 0; c < GRID_SIZE; c++) {
          const x = labelWidth + c * cellW;
          const active = currentGrid[r]?.[c];

          if (active) {
            const pulse = 0.5 + 0.5 * Math.sin(phase * 2 + r * 0.9 + c * 0.6);
            const alpha = 0.35 + pulse * 0.35;

            // Glow fill
            ctx.shadowColor = glow;
            ctx.shadowBlur = 6 + pulse * 5;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
            ctx.shadowBlur = 0;

            // Bright center
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5 + pulse * 0.5;
            ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.02)`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          }

          // Border
          ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${active ? 0.25 : 0.06})`;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        }

        // Row fill indicator (right side tiny bar)
        if (rowCount > 0) {
          const barH = cellH - 4;
          const fillH = barH * rowIntensity;
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
          ctx.fillRect(w - 3, y + 2 + (barH - fillH), 2, fillH);
        }
      }

      // Scanlines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
      for (let sy = 0; sy < h; sy += 2) ctx.fillRect(0, sy, w, 1);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [color, glowColor, bgColor]);

  const totalActive = grid.flat().filter(Boolean).length;

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 100, cursor: 'pointer', touchAction: 'none', borderRadius: 3 }}
        onClick={handleClick}
        onTouchStart={handleClick}
      />
      <div className="flex justify-between mt-1" style={{ fontSize: '6px', opacity: 0.2, color }}>
        <span>{totalActive} / {GRID_SIZE * GRID_SIZE}</span>
        <span>MACRO</span>
      </div>
    </div>
  );
}