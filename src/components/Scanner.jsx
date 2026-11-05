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
          fps: 10,
          qrbox: { width: 250, height: 150 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ]
        };

        // Intentar encendido directo con cámara trasera
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
        console.warn("Reintentando con selector de dispositivos...", err);
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            // Seleccionar la cámara principal trasera del dispositivo
            const backCamera = devices[devices.length - 1];
            await html5Qrcode.start(
              backCamera.id,
              { fps: 10, qrbox: { width: 250, height: 150 } },
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

    // Pequeño retardo para asegurar que el elemento esté montado en pantalla
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