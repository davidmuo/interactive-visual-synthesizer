import { useRef, useEffect, useCallback } from 'react';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

interface XYPadProps {
  xValue: number;
  yValue: number;
  onXChange: (v: number) => void;
  onYChange: (v: number) => void;
  xLabel?: string;
  yLabel?: string;
  color?: string;
  glowColor?: string;
  bgColor?: string;
}

export function XYPad({ xValue, yValue, onXChange, onYChange, xLabel = 'X', yLabel = 'Y', color = '#ffb000', glowColor, bgColor = '#0c0c14' }: XYPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const phaseRef = useRef(0);
  // Trail of past cursor positions for wave wake effect
  const trailRef = useRef<Array<{ x: number; y: number; age: number }>>([]);

  const updateFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as TouchEvent).touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    onXChange(nx);
    onYChange(ny);
  }, [onXChange, onYChange]);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      updateFromEvent(e);
    };
    const handleUp = () => { isDragging.current = false; };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [updateFromEvent]);

  // Canvas render — static gradient landscape with cursor wake/ripple
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastX = xValue;
    let lastY = yValue;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.floor(rect.width * dpr);
      const ph = Math.floor(rect.height * dpr);
      if (pw === 0 || ph === 0) { animId = requestAnimationFrame(render); return; }
      canvas.width = pw;
      canvas.height = ph;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      const rgb = hexToRgb(color);
      const glow = glowColor || color;
      const glowRgb = hexToRgb(glow);
      const bgRgb = hexToRgb(bgColor);

      phaseRef.current += 0.01;
      const phase = phaseRef.current;

      const cx = xValue * w;
      const cy = (1 - yValue) * h;

      // Track cursor trail for wake effect
      if (Math.abs(xValue - lastX) > 0.001 || Math.abs(yValue - lastY) > 0.001) {
        trailRef.current.push({ x: xValue, y: yValue, age: 0 });
        if (trailRef.current.length > 40) trailRef.current.shift();
        lastX = xValue;
        lastY = yValue;
      }
      // Age all trail points
      for (const t of trailRef.current) t.age += 0.016;
      // Remove old ones
      trailRef.current = trailRef.current.filter(t => t.age < 3);

      // --- Static dithered gradient landscape ---
      // The gradient is based purely on pixel position + slow time drift
      // Cursor does NOT move the gradient — it moves through it
      const ditherScale = 2;
      const cols = Math.ceil(w / ditherScale);
      const rows = Math.ceil(h / ditherScale);

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * ditherScale;
          const py = gy * ditherScale;

          const nx = gx / cols;
          const ny = gy / rows;

          // Static landscape waves — slow drift, NOT tied to cursor
          const wave1 = Math.sin(nx * 8 + phase * 0.3) * 0.5 + 0.5;
          const wave2 = Math.sin(ny * 10 + phase * 0.2 + 1.5) * 0.5 + 0.5;
          const wave3 = Math.sin((nx * 3 + ny * 4) + phase * 0.15) * 0.5 + 0.5;
          const wave4 = Math.sin(nx * 5 - ny * 3 + phase * 0.25 + 3.0) * 0.5 + 0.5;

          // Base landscape intensity
          let intensity = (wave1 * 0.3 + wave2 * 0.25 + wave3 * 0.25 + wave4 * 0.2) * 0.14;

          // Wake/ripple from cursor trail — expanding rings from past positions
          for (const t of trailRef.current) {
            const tdx = nx - t.x;
            const tdy = ny - (1 - t.y);
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            const rippleRadius = t.age * 0.15; // expands over time
            const rippleWidth = 0.03;
            const ringDist = Math.abs(tdist - rippleRadius);
            if (ringDist < rippleWidth) {
              const rippleStrength = (1 - ringDist / rippleWidth) * Math.max(0, 1 - t.age * 0.5);
              intensity += rippleStrength * 0.12;
            }
          }

          // Subtle proximity glow — just a soft halo, not moving the landscape
          const dx = nx - xValue;
          const dy = ny - (1 - yValue);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const halo = Math.max(0, 1 - dist * 4) * 0.06;
          intensity += halo;

          // Ordered dithering (2x2 Bayer)
          const bayer = [
            [0.0, 0.5],
            [0.75, 0.25],
          ];
          const threshold = bayer[gy % 2][gx % 2];
          const dithered = intensity > threshold * 0.18 ? intensity : intensity * 0.25;

          const r = Math.round(rgb.r * dithered + bgRgb.r * (1 - dithered));
          const g = Math.round(rgb.g * dithered + bgRgb.g * (1 - dithered));
          const b = Math.round(rgb.b * dithered + bgRgb.b * (1 - dithered));

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(px, py, ditherScale, ditherScale);
        }
      }

      // --- Subtle grid lines ---
      const breathe = 0.5 + 0.5 * Math.sin(phase * 0.6);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.02 + breathe * 0.01})`;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo((w / 8) * i, 0); ctx.lineTo((w / 8) * i, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (h / 8) * i); ctx.lineTo(w, (h / 8) * i); ctx.stroke();
      }

      // --- Crosshair lines ---
      ctx.setLineDash([2, 3]);
      const vGrad = ctx.createLinearGradient(cx, 0, cx, h);
      vGrad.addColorStop(0, 'transparent');
      vGrad.addColorStop(Math.max(0.01, (1 - yValue) - 0.3), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
      vGrad.addColorStop(Math.max(0.02, 1 - yValue), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
      vGrad.addColorStop(Math.min(0.99, (1 - yValue) + 0.3), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
      vGrad.addColorStop(1, 'transparent');
      ctx.strokeStyle = vGrad;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

      const hGrad = ctx.createLinearGradient(0, cy, w, cy);
      hGrad.addColorStop(0, 'transparent');
      hGrad.addColorStop(Math.max(0.01, xValue - 0.3), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
      hGrad.addColorStop(Math.max(0.02, xValue), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
      hGrad.addColorStop(Math.min(0.99, xValue + 0.3), `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
      hGrad.addColorStop(1, 'transparent');
      ctx.strokeStyle = hGrad;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      ctx.setLineDash([]);

      // --- Main cursor dot ---
      const ringPulse = 0.8 + 0.2 * Math.sin(phase * 2.5);
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, 0.18)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner bright dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;

      // --- Labels ---
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
      ctx.font = "7px 'Share Tech Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(xLabel, w / 2, h - 3);
      ctx.save();
      ctx.translate(7, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();

      // Corner value indicators
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
      ctx.font = "6px 'Share Tech Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(xValue * 100)}%`, w - 3, 8);
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(yValue * 100)}%`, 3, 8);

      // Scanlines
      ctx.fillStyle = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.04)`;
      for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [xValue, yValue, color, glowColor, xLabel, yLabel, bgColor]);

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    updateFromEvent(e);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: '100%', cursor: 'crosshair', touchAction: 'none', borderRadius: 3 }}
      onMouseDown={handleDown}
      onTouchStart={handleDown}
    />
  );
}