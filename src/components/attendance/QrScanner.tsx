"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Props {
  onScan: (data: string) => void;
  onError?: (err: string) => void;
}

export function QrScanner({ onScan, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStreaming(true);
          tick();
        }
      } catch (err: any) {
        onError?.("Camera access denied or unavailable. Ensure you're on HTTPS.");
      }
    }

    function tick() {
      if (!videoRef.current || !canvasRef.current) {
        animationId = requestAnimationFrame(tick);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationId = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        onScan(code.data);
        stopCamera();
        return;
      }

      animationId = requestAnimationFrame(tick);
    }

    startCamera();

    function stopCamera() {
      cancelAnimationFrame(animationId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setStreaming(false);
    }

    return () => stopCamera();
  }, [onScan, onError]);

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square bg-black rounded-xl overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      {!streaming && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
          Starting camera...
        </div>
      )}
      {/* Scan frame overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 border-2 border-white/50 rounded-lg">
          <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1" />
        </div>
      </div>
    </div>
  );
}