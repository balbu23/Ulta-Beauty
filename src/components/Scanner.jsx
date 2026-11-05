import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef } from 'react';

export function Scanner({ onScanSuccess }) {
  const html5QrcodeRef = useRef(null);

  useEffect(() => {
    const elementId = "reader";
    const html5Qrcode = new Html5Qrcode(elementId);
    html5QrcodeRef.current = html5Qrcode;

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 150 },
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

    // Inicia directamente la cámara trasera ({ facingMode: "environment" })
    html5Qrcode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
          html5QrcodeRef.current.stop().then(() => {
            html5QrcodeRef.current = null;
            onScanSuccess(decodedText);
          }).catch(console.error);
        }
      },
      () => {} // Ignorar errores de encuadre en tiempo real
    ).catch((err) => {
      console.error("Error al iniciar cámara:", err);
    });

    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl">
      <div id="reader" className="w-full"></div>
    </div>
  );
}