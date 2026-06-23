"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface SignaturePadProps {
  label: string;           // np. "Kierowca", "Mechanik"
  /** Wywołane gdy podpis się zmienia. null = wyczyszczony. */
  onChange: (dataUrl: string | null) => void;
  /** Wartość inicjalna (np. przy wczytaniu zapisanego protokołu) */
  initialValue?: string | null;
  disabled?: boolean;
  /** Klasy CSS dla kontenera */
  className?: string;
}

/**
 * SignaturePad — płótno do podpisu palcem / rysikiem.
 * Bez zewnętrznej biblioteki — tylko Canvas API + Pointer Events.
 * Działa na Android/iOS Chrome, tablet + komputer.
 */
export function SignaturePad({
  label,
  onChange,
  initialValue,
  disabled = false,
  className = "",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Pobierz współrzędne względem canvasu uwzględniając DPR i offset
  function getPoint(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  // Inicjalizacja canvasu z DPR (retina)
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setInitialized(true);
  }, []);

  // Wczytaj wartość inicjalną
  useEffect(() => {
    if (!initialized) return;
    const canvas = canvasRef.current;
    if (!canvas || !initialValue) return;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      setIsEmpty(false);
    };
    img.src = initialValue;
  }, [initialized, initialValue]);

  useEffect(() => {
    initCanvas();
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, [initCanvas]);

  // Pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;

    function onPointerDown(e: PointerEvent) {
      if (disabled) return;
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      lastPoint.current = getPoint(e, canvas!);
      const ctx = canvas!.getContext("2d")!;
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x / (window.devicePixelRatio || 1), lastPoint.current.y / (window.devicePixelRatio || 1));
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDrawing.current || disabled) return;
      e.preventDefault();
      const pt = getPoint(e, canvas!);
      const ctx = canvas!.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.beginPath();
      if (lastPoint.current) {
        ctx.moveTo(lastPoint.current.x / dpr, lastPoint.current.y / dpr);
      }
      ctx.lineTo(pt.x / dpr, pt.y / dpr);
      ctx.stroke();
      lastPoint.current = pt;
      setIsEmpty(false);
    }

    function onPointerUp(e: PointerEvent) {
      if (!isDrawing.current) return;
      e.preventDefault();
      isDrawing.current = false;
      lastPoint.current = null;
      // Eksportuj podpis do base64
      onChange(canvas!.toDataURL("image/png"));
    }

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [disabled, onChange]);

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Etykieta + przycisk wyczyść */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        {!isEmpty && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-red-500 hover:text-red-700 underline transition-colors no-print"
          >
            Wyczyść
          </button>
        )}
      </div>

      {/* Obszar podpisu */}
      <div
        className={`relative rounded-lg border-2 ${
          isEmpty ? "border-dashed border-slate-300" : "border-slate-400"
        } bg-white overflow-hidden`}
        style={{ height: 120 }}
      >
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${
            disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair touch-none"
          }`}
          style={{ touchAction: "none" }}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none no-print">
            <span className="text-slate-400 text-sm select-none">
              ✍️ Podpisz palcem lub rysikiem
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
