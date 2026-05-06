import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as Tone from 'tone';

// Default resolution
const DEFAULT_COLS = 128;
const DEFAULT_ROWS = 64;

// Resolution presets
const RESOLUTIONS = [
  { label: '64×32', cols: 64, rows: 32 },
  { label: '128×64', cols: 128, rows: 64 },
  { label: '256×128', cols: 256, rows: 128 },
  { label: '512×256', cols: 512, rows: 256 },
] as const;

const PENTATONIC: Record<string, string[]> = {
  C: ['C', 'D', 'E', 'G', 'A'],
  D: ['D', 'E', 'F#', 'A', 'B'],
  E: ['E', 'F#', 'G#', 'B', 'C#'],
  F: ['F', 'G', 'A', 'C', 'D'],
  G: ['G', 'A', 'B', 'D', 'E'],
  A: ['A', 'B', 'C#', 'E', 'F#'],
  B: ['B', 'C#', 'D#', 'F#', 'G#'],
};

// Amber palette
const AMBER = '#ffb000';
const AMBER_GLOW = '#ffcc44';
const DARK = '#0c0c14';

// Helper: parse hex to {r,g,b}
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16) };
}

export interface PixelGridHandle {
  clear: () => void;
  fill: () => void;
  setGrid: (g: boolean[][]) => void;
  getGrid: () => boolean[][];
  getAnalyserData: () => Float32Array | null;
  getResolution: () => { cols: number; rows: number };
  getCanvas: () => HTMLCanvasElement | null;
  undo: () => boolean;
  redo: () => boolean;
}

interface PixelGridProps {
  isPlaying: boolean;
  rootKey: string;
  octaveShift: number;
  reverbWet: number;
  delayWet: number;
  delayTime: string;
  filterFreq: number;
  volume: number;
  bpm: number;
  currentCol: number;
  waveform: 'sine' | 'triangle' | 'fmsine' | 'amsine';
  attack: number;
  release: number;
  chorusWet: number;
  swing: number;
  tool: 'draw' | 'erase' | 'line';
  cols?: number;
  rows?: number;
  pan?: number;
  resonance?: number;
  drive?: number;
  muted?: boolean;
  onColTriggered?: (col: number, notes: string[]) => void;
  accentColor?: string;
  accentGlow?: string;
  bgColor?: string;
  brushColor?: string;
}

export const PixelGrid = forwardRef<PixelGridHandle, PixelGridProps>(
  (
    {
      isPlaying, rootKey, octaveShift, reverbWet, delayWet, delayTime,
      filterFreq, volume, bpm, currentCol, waveform, attack, release,
      chorusWet, swing, tool, cols: COLS = DEFAULT_COLS, rows: ROWS = DEFAULT_ROWS,
      pan = 0, resonance = 50, drive = 0, muted = false,
      onColTriggered,
      accentColor = AMBER, accentGlow = AMBER_GLOW, bgColor = DARK,
      brushColor,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [grid, setGrid] = useState<boolean[][]>(() =>
      Array.from({ length: ROWS }, () => Array(COLS).fill(false))
    );
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [lastCell, setLastCell] = useState<[number, number] | null>(null);
    const gridRef = useRef(grid);
    gridRef.current = grid;

    // Color per cell — tracks which brush color was used
    const colorGridRef = useRef<(string | null)[][]>(
      Array.from({ length: ROWS }, () => Array(COLS).fill(null))
    );

    // Keep brushColor in a ref so drag handlers always see the latest value
    const brushColorRef = useRef(brushColor);
    brushColorRef.current = brushColor;

    // Glow particles
    const particlesRef = useRef<Array<{
      x: number; y: number; life: number; vx: number; vy: number; size: number;
    }>>([]);

    // Trail columns for glow fade
    const trailRef = useRef<Map<number, number>>(new Map());

    // Undo/Redo stacks — store grid + color snapshots
    const MAX_UNDO = 50;
    type Snapshot = { grid: boolean[][]; colors: (string | null)[][] };
    const undoStackRef = useRef<Snapshot[]>([]);
    const redoStackRef = useRef<Snapshot[]>([]);

    const takeSnapshot = (): Snapshot => ({
      grid: gridRef.current.map(r => [...r]),
      colors: colorGridRef.current.map(r => [...r]),
    });

    const pushUndo = () => {
      undoStackRef.current.push(takeSnapshot());
      if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
      redoStackRef.current = []; // clear redo on new action
    };

    // Audio — fixed pool of individual synths (no PolySynth voice accumulation)
    const VOICE_COUNT = 12;
    const synthPoolRef = useRef<Tone.Synth[]>([]);
    const voiceIndexRef = useRef(0); // round-robin voice allocation
    const reverbRef = useRef<Tone.Reverb | null>(null);
    const delayRef = useRef<Tone.FeedbackDelay | null>(null);
    const filterRef = useRef<Tone.Filter | null>(null);
    const chorusRef = useRef<Tone.Chorus | null>(null);
    const limiterRef = useRef<Tone.Limiter | null>(null);
    const analyserRef = useRef<Tone.Analyser | null>(null);
    const gainRef = useRef<Tone.Gain | null>(null);
    const pannerRef = useRef<Tone.Panner | null>(null);
    const distortionRef = useRef<Tone.Distortion | null>(null);
    const audioInitRef = useRef(false);
    const lastPlayedCol = useRef(-1);

    useImperativeHandle(ref, () => ({
      clear: () => { pushUndo(); setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false))); particlesRef.current = []; colorGridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); },
      fill: () => {
        pushUndo();
        setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(true)));
        const bc = brushColorRef.current || accentColor;
        colorGridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(bc));
      },
      setGrid: (g: boolean[][]) => { pushUndo(); setGrid(g); },
      getGrid: () => gridRef.current,
      getAnalyserData: () => analyserRef.current ? analyserRef.current.getValue() as Float32Array : null,
      getResolution: () => ({ cols: COLS, rows: ROWS }),
      getCanvas: () => canvasRef.current,
      undo: () => {
        if (undoStackRef.current.length === 0) return false;
        const snapshot = undoStackRef.current.pop();
        if (!snapshot) return false;
        redoStackRef.current.push(takeSnapshot());
        setGrid(snapshot.grid);
        colorGridRef.current = snapshot.colors;
        return true;
      },
      redo: () => {
        if (redoStackRef.current.length === 0) return false;
        const snapshot = redoStackRef.current.pop();
        if (!snapshot) return false;
        undoStackRef.current.push(takeSnapshot());
        setGrid(snapshot.grid);
        colorGridRef.current = snapshot.colors;
        return true;
      },
    }), [COLS, ROWS, accentColor]);

    // Reset grid when resolution changes
    useEffect(() => {
      setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
      particlesRef.current = [];
      colorGridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }, [COLS, ROWS]);

    // Init audio — warm melodic chain
    useEffect(() => {
      if (audioInitRef.current) return;

      const filter = new Tone.Filter({ frequency: filterFreq, type: 'lowpass', rolloff: -12, Q: 1.0 });
      const chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 4.5, depth: 0.5, wet: chorusWet });
      chorus.start();
      const delay = new Tone.FeedbackDelay({ delayTime: delayTime as any, feedback: 0.4, wet: delayWet });
      const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.04, wet: reverbWet });
      const limiter = new Tone.Limiter(-3);
      const analyser = new Tone.Analyser('waveform', 256);
      const gain = new Tone.Gain(1);
      const panner = new Tone.Panner(pan);
      const distortion = new Tone.Distortion(drive / 100);

      // Build effects chain: filter → distortion → chorus → delay → reverb → limiter → analyser → gain → panner → out
      filter.connect(distortion);
      distortion.connect(chorus);
      chorus.connect(delay);
      delay.connect(reverb);
      reverb.connect(limiter);
      limiter.connect(analyser);
      analyser.connect(gain);
      gain.connect(panner);
      panner.toDestination();

      // Create voice pool, each connected to the shared filter input
      const synthPool: Tone.Synth[] = [];
      for (let i = 0; i < VOICE_COUNT; i++) {
        const synth = new Tone.Synth({
          oscillator: { type: waveform as any, partialCount: 3 },
          envelope: {
            attack: Math.max(0.01, attack),
            decay: 0.6,
            sustain: 0.4,
            release: Math.max(0.05, release),
          },
          volume: -6, // headroom for layered voices
        });
        synth.connect(filter);
        synthPool.push(synth);
      }

      synthPoolRef.current = synthPool;
      filterRef.current = filter;
      chorusRef.current = chorus;
      delayRef.current = delay;
      reverbRef.current = reverb;
      limiterRef.current = limiter;
      analyserRef.current = analyser;
      gainRef.current = gain;
      pannerRef.current = panner;
      distortionRef.current = distortion;
      audioInitRef.current = true;

      return () => {
        synthPool.forEach((synth) => synth.dispose());
        filter.dispose(); chorus.dispose();
        delay.dispose(); reverb.dispose(); limiter.dispose(); analyser.dispose(); gain.dispose(); panner.dispose(); distortion.dispose();
        audioInitRef.current = false;
      };
    }, []);

    // Update audio params
    useEffect(() => { if (reverbRef.current) reverbRef.current.wet.value = reverbWet; }, [reverbWet]);
    useEffect(() => { if (delayRef.current) { delayRef.current.wet.value = delayWet; delayRef.current.delayTime.value = delayTime as any; } }, [delayWet, delayTime]);
    useEffect(() => { if (filterRef.current) filterRef.current.frequency.rampTo(filterFreq, 0.1); }, [filterFreq]);
    // Volume + Mute combined — mute always wins
    useEffect(() => {
      if (gainRef.current) {
        gainRef.current.gain.rampTo(muted ? 0 : Math.pow(10, volume / 20), 0.02);
      }
    }, [volume, muted]);
    useEffect(() => { if (chorusRef.current) chorusRef.current.wet.value = chorusWet; }, [chorusWet]);
    // Pan — maps -1..1 directly to Tone.Panner
    useEffect(() => { if (pannerRef.current) pannerRef.current.pan.rampTo(pan, 0.05); }, [pan]);
    // Resonance — maps 0..100 to filter Q (0.1 to 18)
    useEffect(() => { if (filterRef.current) filterRef.current.Q.rampTo(0.1 + (resonance / 100) * 17.9, 0.1); }, [resonance]);
    // Drive — maps 0..100 to Tone.Distortion (0 to 1)
    useEffect(() => { if (distortionRef.current) distortionRef.current.distortion = drive / 100; }, [drive]);
    useEffect(() => {
      if (synthPoolRef.current) {
        synthPoolRef.current.forEach((synth) => {
          synth.set({
            oscillator: { type: waveform as any },
            envelope: {
              attack: Math.max(0.01, attack),
              decay: 0.6,
              sustain: 0.4,
              release: Math.max(0.05, release),
            },
          });
        });
      }
    }, [waveform, attack, release]);

    const rowToNote = useCallback(
      (row: number): string => {
        const scale = PENTATONIC[rootKey] || PENTATONIC.C;
        const noteIdx = ROWS - 1 - row;
        const scaleIdx = noteIdx % scale.length;
        const oct = Math.floor(noteIdx / scale.length) + 2 + octaveShift;
        return `${scale[scaleIdx]}${Math.max(1, Math.min(7, oct))}`;
      },
      [rootKey, octaveShift, ROWS]
    );

    // Play column
    useEffect(() => {
      if (!isPlaying || currentCol === lastPlayedCol.current) return;
      lastPlayedCol.current = currentCol;

      const startAudio = async () => { if (Tone.getContext().state !== 'running') await Tone.start(); };
      startAudio();

      if (synthPoolRef.current.length === 0) return;

      const now = Tone.now();

      // Trail glow
      trailRef.current.set(currentCol, 1.0);

      // Calculate note duration based on BPM — let notes sustain across ~3 steps for overlap
      const stepDuration = (60 / bpm) * (4 / COLS);
      const noteDuration = Math.max(0.08, stepDuration * 3);

      const notes: string[] = [];
      const noteRows: number[] = []; // track which row for velocity variation
      const canvas = canvasRef.current;
      for (let r = 0; r < ROWS; r++) {
        if (gridRef.current[r]?.[currentCol]) {
          notes.push(rowToNote(r));
          noteRows.push(r);
          if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const cellW = (canvas.width / dpr) / COLS;
            const cellH = (canvas.height / dpr) / ROWS;
            for (let p = 0; p < 2; p++) {
              particlesRef.current.push({
                x: currentCol * cellW + cellW / 2,
                y: r * cellH + cellH / 2,
                life: 1,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2 - 0.5,
                size: 1 + Math.random() * 1.5,
              });
            }
          }
        }
      }

      if (notes.length > 0) {
        // Deduplicate notes, keeping the lowest row index (highest pitch position)
        const noteMap = new Map<string, number>();
        notes.forEach((note, i) => {
          if (!noteMap.has(note)) noteMap.set(note, noteRows[i]);
        });
        const uniqueNotes = [...noteMap.entries()];

        // Round-robin voice allocation — allows note overlap from previous steps
        const triggerTime = now + 0.003;
        uniqueNotes.forEach(([note, row]) => {
          const voiceIdx = voiceIndexRef.current % VOICE_COUNT;
          voiceIndexRef.current++;
          const synth = synthPoolRef.current[voiceIdx];
          try {
            // Gentle velocity based on vertical position — lower rows (higher pitch) slightly softer
            const normalizedRow = row / ROWS; // 0 = top (high), 1 = bottom (low)
            const velocity = 0.5 + normalizedRow * 0.4 + Math.random() * 0.1; // 0.5–1.0 range
            synth.triggerAttackRelease(note, noteDuration, triggerTime, velocity);
          } catch { }
        });
      }

      onColTriggered?.(currentCol, notes);
    }, [currentCol, isPlaying, rowToNote, onColTriggered, COLS, ROWS, bpm]);

    // Cell from event
    const getCellFromEvent = (e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ('touches' in e) {
        // Use changedTouches for touchend (touches is empty), touches for touchstart/move
        const touch = e.touches[0] || e.changedTouches[0];
        if (!touch) return null;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const col = Math.floor(((clientX - rect.left) / rect.width) * COLS);
      const row = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
      return [row, col];
    };

    const setCell = (row: number, col: number, val: boolean) => {
      setGrid((prev) => {
        if (prev[row][col] === val) return prev;
        const next = prev.map((r) => [...r]);
        next[row][col] = val;
        return next;
      });
      // Always record brush color for drawn cells
      if (val) {
        colorGridRef.current[row][col] = brushColorRef.current || accentColor;
      } else {
        colorGridRef.current[row][col] = null;
      }
    };

    // Bresenham line
    const drawLine = (r0: number, c0: number, r1: number, c1: number, val: boolean) => {
      const dr = Math.abs(r1 - r0);
      const dc = Math.abs(c1 - c0);
      const sr = r0 < r1 ? 1 : -1;
      const sc = c0 < c1 ? 1 : -1;
      let err = dc - dr;
      let cr = r0, cc = c0;
      const cellsToColor: [number, number][] = [];
      const bc = brushColorRef.current || accentColor;
      setGrid((prev) => {
        const next = prev.map((r) => [...r]);
        while (true) {
          if (cr >= 0 && cr < ROWS && cc >= 0 && cc < COLS) {
            next[cr][cc] = val;
            cellsToColor.push([cr, cc]);
            // Set color immediately inside the loop for each cell
            colorGridRef.current[cr][cc] = val ? bc : null;
          }
          if (cr === r1 && cc === c1) break;
          const e2 = 2 * err;
          if (e2 > -dr) { err -= dr; cc += sc; }
          if (e2 < dc) { err += dc; cr += sr; }
        }
        return next;
      });
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
      if (isPlaying) return;
      e.preventDefault();
      const cell = getCellFromEvent(e);
      if (!cell) return;
      pushUndo(); // snapshot before any modification
      setIsMouseDown(true);
      setLastCell(cell);
      if (tool === 'line') return; // wait for mouseup
      setCell(cell[0], cell[1], tool === 'draw');
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isMouseDown || isPlaying) return;
      e.preventDefault();
      const cell = getCellFromEvent(e);
      if (!cell) return;
      if (tool === 'line') return;
      // Draw with interpolation to last cell
      if (lastCell) {
        drawLine(lastCell[0], lastCell[1], cell[0], cell[1], tool === 'draw');
      } else {
        setCell(cell[0], cell[1], tool === 'draw');
      }
      setLastCell(cell);
    };

    const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
      if (tool === 'line' && isMouseDown && lastCell) {
        const cell = getCellFromEvent(e);
        if (cell) drawLine(lastCell[0], lastCell[1], cell[0], cell[1], true);
      }
      setIsMouseDown(false);
      setLastCell(null);
    };

    // Resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, []);

    // Render
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let animId: number;

      const render = () => {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const cellW = w / COLS;
        const cellH = h / ROWS;

        const rgb = hexToRgb(accentColor);

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // Only draw major gridlines
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= COLS; c += 8) {
          ctx.beginPath();
          ctx.moveTo(c * cellW, 0);
          ctx.lineTo(c * cellW, h);
          ctx.stroke();
        }

        // Octave lines
        const scale = PENTATONIC[rootKey] || PENTATONIC.C;
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
        for (let r = 0; r <= ROWS; r++) {
          if ((ROWS - r) % scale.length === 0) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellH);
            ctx.lineTo(w, r * cellH);
            ctx.stroke();
          }
        }

        // Trail glow columns
        trailRef.current.forEach((alpha, col) => {
          if (alpha > 0.01) {
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.06})`;
            ctx.fillRect(col * cellW, 0, cellW, h);
            trailRef.current.set(col, alpha * 0.92);
          } else {
            trailRef.current.delete(col);
          }
        });

        // Active cells — use per-cell color if available
        // Batch by color for performance
        const colorBuckets = new Map<string, [number, number][]>();
        const currentGrid = gridRef.current;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (currentGrid[r]?.[c]) {
              const cellColor = colorGridRef.current[r]?.[c] || accentColor;
              let bucket = colorBuckets.get(cellColor);
              if (!bucket) { bucket = []; colorBuckets.set(cellColor, bucket); }
              bucket.push([r, c]);
            }
          }
        }
        colorBuckets.forEach((cells, color) => {
          ctx.fillStyle = color;
          cells.forEach(([r, c]) => {
            ctx.fillRect(c * cellW, r * cellH, Math.max(1, cellW - 0.5), Math.max(1, cellH - 0.5));
          });
        });

        // Playhead
        if (isPlaying) {
          const px = currentCol * cellW;

          // Column highlight
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)`;
          ctx.fillRect(px, 0, cellW, h);

          // Playhead line
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = 6;
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 0.5, 0);
          ctx.lineTo(px + 0.5, h);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Active cells in playhead — bright white
          ctx.fillStyle = '#ffffff';
          for (let r = 0; r < ROWS; r++) {
            if (currentGrid[r]?.[currentCol]) {
              ctx.fillRect(currentCol * cellW, r * cellH, Math.max(1, cellW - 0.5), Math.max(1, cellH - 0.5));
            }
          }
        }

        // Particles (capped)
        const particles = particlesRef.current;
        if (particles.length > 200) particles.splice(0, particles.length - 200);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.02;
          if (p.life <= 0) { particles.splice(i, 1); continue; }

          ctx.globalAlpha = p.life * 0.7;
          ctx.fillStyle = accentGlow;
          const size = p.life * p.size;
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;

        // CRT scanlines (every 3px for performance)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
        for (let y = 0; y < h; y += 3) {
          ctx.fillRect(0, y, w, 1);
        }

        animId = requestAnimationFrame(render);
      };

      animId = requestAnimationFrame(render);
      return () => cancelAnimationFrame(animId);
    }, [isPlaying, currentCol, rootKey, COLS, ROWS, accentColor, accentGlow, bgColor]);

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          cursor: isPlaying ? 'default' : tool === 'draw' ? 'crosshair' : tool === 'line' ? 'cell' : 'pointer',
          touchAction: 'none',
        }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={() => { setIsMouseDown(false); setLastCell(null); }}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
    );
  }
);

PixelGrid.displayName = 'PixelGrid';
export { DEFAULT_COLS as COLS, DEFAULT_ROWS as ROWS, PENTATONIC, RESOLUTIONS };