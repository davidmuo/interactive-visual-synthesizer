import { useRef, useEffect } from 'react';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

interface WaveformDisplayProps {
  getData: () => Float32Array | null;
  isPlaying: boolean;
  mode?: 'wave' | 'bars' | 'combined';
  height?: number;
  color?: string;
  glowColor?: string;
  bgColor?: string;
}

export function WaveformDisplay({ getData, isPlaying, mode = 'combined', height, color = '#ffb000', glowColor, bgColor = '#0c0c14' }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

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

      // Dark background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = (w / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      phase += 0.02;
      const data = getData();

      if (data && isPlaying) {
        // Store history for trail effect
        historyRef.current.push(new Float32Array(data));
        if (historyRef.current.length > 5) historyRef.current.shift();

        if (mode === 'bars' || mode === 'combined') {
          // Spectrum bars at the bottom
          const barCount = 24;
          const barW = w / barCount - 1;
          const step = Math.floor(data.length / barCount);
          for (let i = 0; i < barCount; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] as number);
            const avg = sum / step;
            const barH = avg * h * 1.8;

            // Gradient bar
            const grad = ctx.createLinearGradient(0, h, 0, h - barH);
            grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
            grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
            grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
            ctx.fillStyle = grad;
            ctx.fillRect(i * (barW + 1), h - barH, barW, barH);

            // Bright cap
            if (barH > 2) {
              ctx.fillStyle = glow;
              ctx.globalAlpha = 0.8;
              ctx.fillRect(i * (barW + 1), h - barH, barW, 1.5);
              ctx.globalAlpha = 1;
            }
          }
        }

        if (mode === 'wave' || mode === 'combined') {
          // Ghost trails
          historyRef.current.forEach((hist, idx) => {
            const alpha = (idx / historyRef.current.length) * 0.15;
            ctx.beginPath();
            const sliceWidth = w / hist.length;
            let x = 0;
            for (let i = 0; i < hist.length; i++) {
              const v = (hist[i] as number) * 0.7;
              const y = h / 2 + v * (h / 2);
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          // Fill under main wave
          ctx.beginPath();
          const sliceWidth = w / data.length;
          let x = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] as number) * 0.7;
            const y = h / 2 + v * (h / 2);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.lineTo(w, h / 2);
          ctx.lineTo(0, h / 2);
          ctx.closePath();
          const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
          fillGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
          fillGrad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.02)`);
          fillGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
          ctx.fillStyle = fillGrad;
          ctx.fill();

          // Main waveform stroke
          ctx.beginPath();
          x = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] as number) * 0.7;
            const y = h / 2 + v * (h / 2);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.shadowColor = glow;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      } else {
        // Idle — animated breathing line
        historyRef.current = [];
        const breath = Math.sin(phase * 2) * 0.3 + 0.5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const noise = Math.sin(x * 0.05 + phase * 3) * 2 * breath +
                       Math.sin(x * 0.12 + phase * 1.5) * 1.5 * breath;
          const y = h / 2 + noise;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.15 + breath * 0.1})`;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Scanlines
      const scanRgb = hexToRgb(bgColor);
      ctx.fillStyle = `rgba(${scanRgb.r}, ${scanRgb.g}, ${scanRgb.b}, 0.04)`;
      for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [getData, isPlaying, mode, color, glowColor, bgColor]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: height || '100%' }} />;
}