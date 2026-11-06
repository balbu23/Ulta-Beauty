import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export function Scanner({ onScanSuccess }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    let html5Qrcode;
    const elementId = "reader";

    const startScanner = async () => {
      try {
        html5Qrcode = new Html5Qrcode(elementId);
        scannerRef.current = html5Qrcode;

        const config = {
          fps: 15, // Mayor tasa de refresco para agilizar la lectura
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          // Restricciones de video optimizadas para forzar enfoque continuo y resolución 720p en iOS/Safari
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: { ideal: "continuous" }
          }
        };

        // 1. Intentar encendido directo con cámara trasera y foco continuo
        await html5Qrcode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (scannerRef.current && scannerRef.current.isScanning) {
              scannerRef.current.stop().then(() => {
                scannerRef.current = null;
                onScanSuccess(decodedText);
              }).catch(console.error);
            }
          },
          () => {}
        );
      } catch (err) {
        console.warn("Reintentando con selección manual de lente...", err);
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            // Filtrar para seleccionar la cámara trasera principal de iPhone (descartando lentes Ultra Wide o Telephoto que distorsionan el foco macro)
            const mainBackCamera = devices.find(d => 
              /back|rear|trasera/i.test(d.label) && !/ultra|wide|tele/i.test(d.label)
            ) || devices.find(d => /back|rear|trasera/i.test(d.label)) || devices[devices.length - 1];

            const configFallback = {
              fps: 15,
              qrbox: { width: 260, height: 160 },
              aspectRatio: 1.0,
              formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
              ],
              videoConstraints: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: { ideal: "continuous" }
              }
            };

            await html5Qrcode.start(
              mainBackCamera.id,
              configFallback,
              (decodedText) => {
                if (scannerRef.current && scannerRef.current.isScanning) {
                  scannerRef.current.stop().then(() => {
                    scannerRef.current = null;
                    onScanSuccess(decodedText);
                  }).catch(console.error);
                }
              },
              () => {}
            );
          }
        } catch (e) {
          alert("Por favor autoriza el permiso de la cámara en las configuraciones del navegador.");
          console.error(e);
        }
      }
    };

    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl bg-slate-900 min-h-[240px] flex items-center justify-center">
      <div id="reader" className="w-full min-h-[240px]"></div>
    </div>
  );
}