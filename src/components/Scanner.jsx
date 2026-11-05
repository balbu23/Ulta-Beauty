import { Html5QrcodeScanner, Html5QrcodeScanType, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef } from 'react';

export function Scanner({ onScanSuccess }) {
  const scannerInstanceRef = useRef(null);

  useEffect(() => {
    // Si ya existe una instancia activa, evitar crear otra
    if (scannerInstanceRef.current) return;

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 150 },
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    const scanner = new Html5QrcodeScanner('reader', config, false);
    scannerInstanceRef.current = scanner;

    scanner.render(
      (decodedText) => {
        if (scannerInstanceRef.current) {
          scannerInstanceRef.current.clear().catch(console.error);
          scannerInstanceRef.current = null;
        }
        onScanSuccess(decodedText);
      },
      (error) => console.warn(error)
    );

    return () => {
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.clear().catch(console.error);
        scannerInstanceRef.current = null;
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-sm mx-auto bg-white p-4 rounded-xl shadow">
      <div id="reader" className="w-full"></div>
    </div>
  );
}