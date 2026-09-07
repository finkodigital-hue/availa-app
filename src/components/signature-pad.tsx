import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Point = { x: number; y: number; move: boolean };

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#171717";
    ctx.lineWidth = Math.max(2, window.devicePixelRatio * 1.7);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const point of pointsRef.current) {
      if (point.move) ctx.moveTo(point.x * canvas.width, point.y * canvas.height);
      else ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
    }
    ctx.stroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const addPoint = (event: PointerEvent<HTMLCanvasElement>, move: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointsRef.current.push({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      move,
    });
    draw();
  };

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || pointsRef.current.length < 2) return;
    setHasSignature(true);
    onChange(canvas.toDataURL("image/png", 0.75));
  };

  const clear = () => {
    pointsRef.current = [];
    setHasSignature(false);
    onChange(null);
    draw();
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border bg-white">
        <canvas
          ref={canvasRef}
          className="block h-40 w-full touch-none cursor-crosshair"
          aria-label="Draw your signature"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawingRef.current = true;
            addPoint(event, true);
          }}
          onPointerMove={(event) => drawingRef.current && addPoint(event, false)}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {!hasSignature && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-neutral-400">
            Sign here with your finger or mouse
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-7 border-b border-neutral-200" />
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasSignature}>
          <RotateCcw className="h-3.5 w-3.5" /> Clear signature
        </Button>
      </div>
    </div>
  );
}
