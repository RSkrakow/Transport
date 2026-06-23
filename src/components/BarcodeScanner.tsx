"use client";

import { useEffect, useRef, useState } from "react";

interface BarcodeScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * BarcodeScanner — kamera z detekcją kodów kreskowych i QR
 * Używa @zxing/browser (wieloformatowy dekoder, działa na Android/iOS Chrome)
 * lub natywnego BarcodeDetector API jeśli dostępne.
 */
export function BarcodeScanner({ onResult, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Skieruj kamerę na kod kreskowy opony");
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      try {
        // Próbuj @zxing/browser (dynamiczny import — nie blokuje SSR)
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const codeReader = new BrowserMultiFormatReader();

        if (!videoRef.current || stopped) return;

        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (stopped) return;
            if (result) {
              const text = result.getText();
              stopped = true;
              controls.stop();
              onResult(text);
            }
            // NotFoundException jest normalny między klatkami — ignoruj
          }
        );

        controlsRef.current = controls;
        setHint("Skieruj kamerę na kod kreskowy opony");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Nie można uruchomić skanera: ${msg}`);
      }
    }

    startScanner();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-sm px-4 pb-3">
        <span className="text-white font-semibold text-base">📷 Skanuj kod opony</span>
        <button
          onClick={onClose}
          className="text-white text-2xl leading-none hover:text-gray-300 transition-colors"
          aria-label="Zamknij"
        >
          ✕
        </button>
      </div>

      {/* Podgląd kamery */}
      <div className="relative w-full max-w-sm bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          className="w-full object-cover"
          style={{ minHeight: 280 }}
          autoPlay
          playsInline
          muted
        />
        {/* Celownik */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div className="border-2 border-yellow-400 rounded-md"
               style={{ width: "70%", height: 96, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
          />
        </div>
      </div>

      {/* Podpowiedź / błąd */}
      <div className="mt-4 px-6 text-center max-w-sm">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <p className="text-gray-300 text-sm">{hint}</p>
        )}
      </div>

      {/* Przycisk zamknij */}
      <button
        onClick={onClose}
        className="mt-6 px-8 py-2.5 bg-white text-black rounded-lg font-semibold text-sm
                   hover:bg-gray-100 active:bg-gray-200 transition-colors"
      >
        Anuluj
      </button>

      {/* Drobny opis */}
      <p className="mt-3 text-gray-500 text-xs text-center px-8 max-w-sm">
        Obsługuje kody EAN, UPC, QR, Data Matrix i inne.
        Dane producenta mogą nie zawierać pełnej specyfikacji.
      </p>
    </div>
  );
}
