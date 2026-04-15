import React, { useEffect, useState } from 'react';
import {
    Html5QrcodeScanner,
    Html5QrcodeScanType,
    Html5QrcodeSupportedFormats,
    Html5Qrcode
} from 'html5-qrcode';

const QRScanner = ({ onScanComplete, onCancel }) => {
    const [error, setError] = useState(null);

    useEffect(() => {
        const scanner = new Html5QrcodeScanner('qr-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });

        const onSuccess = (decodedText, result) => {
            onScanComplete(decodedText);
            scanner.clear().catch(console.error);
        };

        const onFailure = (err) => {
            console.warn('Scan error (non-fatal):', err);
        };

        // ✅ CORRECT usage: getCameras from Html5Qrcode, not Html5QrcodeScanner
        Html5Qrcode.getCameras()
            .then((devices) => {
                if (!devices || devices.length === 0) {
                    setError('No camera devices found.');
                    return;
                }

                scanner.render(onSuccess, onFailure);
            })
            .catch((err) => {
                console.error('Camera access error:', err);
                setError('Camera access denied or unavailable.');
            });

        return () => {
            scanner.clear().catch(console.error);
        };
    }, [onScanComplete]);

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex items-center justify-center">
            <div className="bg-white p-4 rounded shadow w-full max-w-md text-center">
                <h2 className="text-lg font-bold mb-2">Scan Gift Card</h2>
                {error ? (
                    <div className="text-red-600 font-semibold">{error}</div>
                ) : (
                    <div id="qr-reader" className="w-full" />
                )}
                <button
                    onClick={() => {
                        if (onCancel) onCancel();
                    }}
                    className="mt-4 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 rounded text-black font-bold"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default QRScanner;
