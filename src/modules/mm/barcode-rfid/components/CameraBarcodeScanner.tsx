'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    BrowserMultiFormatReader,
    type IScannerControls,
} from '@zxing/browser'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'

type Props = {
    isOpen: boolean
    onClose: () => void
    /**
     * Fired once per successful decode. Single-shot dialogs close afterward;
     * continuous dialogs (POS) stay open so the cashier can scan item by item.
     */
    onDetected: (value: string) => void
    /** Keep the camera open after a hit and report every new code. */
    continuous?: boolean
}

/** Same code seen again within this window is the same item, not a new one. */
const REPEAT_WINDOW_MS = 3000

const hasNativeBarcodeDetector = () =>
    typeof (globalThis as typeof globalThis & { BarcodeDetector?: unknown })
        .BarcodeDetector === 'function'

type CameraOption = { value: string; label: string }

function pickRearCamera(devices: MediaDeviceInfo[]): string | undefined {
    const back = devices.find((d) =>
        /back|rear|environment|trás|arrière/i.test(d.label),
    )
    return back?.deviceId ?? devices[0]?.deviceId
}

/** Decode one frame via native BarcodeDetector when available (Chrome / Edge). */
async function tryNativeBarcodeDetect(
    video: HTMLVideoElement,
): Promise<string | null> {
    const Detector = (globalThis as typeof globalThis & {
        BarcodeDetector?: new (opts?: { formats?: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>
        }
    }).BarcodeDetector

    if (!Detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return null
    }

    try {
        const detector = new Detector({
            formats: [
                'qr_code',
                'code_128',
                'code_39',
                'ean_13',
                'ean_8',
                'upc_a',
                'upc_e',
                'itf',
                'codabar',
                'data_matrix',
            ],
        })
        const codes = await detector.detect(video)
        const text = codes[0]?.rawValue?.trim()
        return text || null
    } catch {
        return null
    }
}

const CameraBarcodeScanner = ({
    isOpen,
    onClose,
    onDetected,
    continuous = false,
}: Props) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const scannerControlsRef = useRef<IScannerControls | null>(null)
    const nativeLoopRef = useRef<number | null>(null)
    const handledRef = useRef(false)
    const lastScanRef = useRef<{ value: string; at: number } | null>(null)
    // Latest callbacks without restarting the camera stream on parent renders.
    const onDetectedRef = useRef(onDetected)
    const onCloseRef = useRef(onClose)

    useEffect(() => {
        onDetectedRef.current = onDetected
        onCloseRef.current = onClose
    }, [onDetected, onClose])

    const [error, setError] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)
    const [cameraOptions, setCameraOptions] = useState<CameraOption[]>([])
    const [selectedCamera, setSelectedCamera] = useState<string>('')
    const [lastScan, setLastScan] = useState<string | null>(null)
    const [scanCount, setScanCount] = useState(0)

    const stopStreams = useCallback(() => {
        handledRef.current = false
        if (nativeLoopRef.current != null) {
            cancelAnimationFrame(nativeLoopRef.current)
            nativeLoopRef.current = null
        }
        try {
            scannerControlsRef.current?.stop()
        } catch {
            /* ZXing may already be stopped */
        }
        scannerControlsRef.current = null
        const video = videoRef.current
        const stream = video?.srcObject as MediaStream | null | undefined
        stream?.getTracks().forEach((t) => t.stop())
        if (video) {
            video.srcObject = null
            video.pause()
        }
    }, [])

    const finishWithCode = useCallback(
        (value: string) => {
            if (continuous) {
                const now = Date.now()
                const last = lastScanRef.current
                // The camera sees the same barcode every frame: count it once.
                if (last?.value === value && now - last.at < REPEAT_WINDOW_MS) {
                    return
                }
                lastScanRef.current = { value, at: now }
                setLastScan(value)
                setScanCount((count) => count + 1)
                onDetectedRef.current(value)
                return
            }
            if (handledRef.current) return
            handledRef.current = true
            stopStreams()
            onDetectedRef.current(value)
            onCloseRef.current()
        },
        [continuous, stopStreams],
    )

    const startNativeLoop = useCallback(() => {
        if (!hasNativeBarcodeDetector()) return
        const video = videoRef.current
        if (!video) return

        const tick = async () => {
            if (handledRef.current || !videoRef.current) return
            const code = await tryNativeBarcodeDetect(videoRef.current)
            if (code) {
                finishWithCode(code)
                return
            }
            nativeLoopRef.current = requestAnimationFrame(() => {
                void tick()
            })
        }
        nativeLoopRef.current = requestAnimationFrame(() => {
            void tick()
        })
    }, [finishWithCode])

    const startZxing = useCallback(
        async (deviceId: string) => {
            const video = videoRef.current
            if (!video) return

            const reader = new BrowserMultiFormatReader()
            const controls = await reader.decodeFromVideoDevice(
                deviceId,
                video,
                (result, err) => {
                    if (handledRef.current) return
                    if (result) {
                        const text = result.getText()?.trim()
                        if (text) finishWithCode(text)
                        return
                    }
                    if (err && !String(err).includes('NotFoundException')) {
                        // keep scanning; occasional decode errors are normal
                    }
                },
            )
            scannerControlsRef.current = controls
        },
        [finishWithCode],
    )

    useEffect(() => {
        if (!isOpen) {
            stopStreams()
            setError(null)
            setStarting(false)
            setLastScan(null)
            setScanCount(0)
            lastScanRef.current = null
            return
        }

        let cancelled = false

        const boot = async () => {
            setStarting(true)
            setError(null)
            handledRef.current = false
            setLastScan(null)
            setScanCount(0)
            lastScanRef.current = null

            // A phone reaches the terminal over the LAN; browsers only expose
            // the camera on a secure origin (https or localhost).
            if (!navigator.mediaDevices?.getUserMedia) {
                setError(
                    window.isSecureContext
                        ? 'This browser does not expose a camera. Use a USB barcode scanner or type the code instead.'
                        : `Camera scanning needs a secure connection. Open ${window.location.host} over https:// (or on localhost) and allow camera permission.`,
                )
                setStarting(false)
                return
            }

            try {
                // Ask for the rear camera first: the permission prompt also
                // reveals device labels, so the rear camera can be picked on a
                // phone instead of defaulting to the selfie camera.
                try {
                    const probe = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
                    })
                    probe.getTracks().forEach((track) => track.stop())
                } catch {
                    /* permission handled by the device list below */
                }
                if (cancelled) return

                const devices =
                    await BrowserMultiFormatReader.listVideoInputDevices()
                if (cancelled) return

                if (!devices.length) {
                    setError(
                        window.isSecureContext
                            ? 'No camera found. Connect a camera and allow the browser permission.'
                            : `Camera scanning needs a secure connection. Open ${window.location.host} over https:// (or on localhost) and allow camera permission.`,
                    )
                    setStarting(false)
                    return
                }

                const options = devices.map((d, i) => ({
                    value: d.deviceId,
                    label: d.label?.trim() || `Camera ${i + 1}`,
                }))
                setCameraOptions(options)

                const initial = pickRearCamera(devices) ?? devices[0].deviceId
                setSelectedCamera(initial)

                const video = videoRef.current
                if (!video) {
                    setError('Video preview unavailable')
                    setStarting(false)
                    return
                }

                startNativeLoop()
                await startZxing(initial)
            } catch (e: unknown) {
                if (!cancelled) {
                    const msg =
                        e instanceof Error
                            ? e.message
                            : 'Could not access the camera'
                    setError(msg)
                }
            } finally {
                if (!cancelled) setStarting(false)
            }
        }

        void boot()

        return () => {
            cancelled = true
            stopStreams()
        }
    }, [isOpen, startNativeLoop, startZxing, stopStreams])

    const onCameraChange = async (opt: CameraOption | null) => {
        const id = opt?.value
        if (!id || id === selectedCamera) return
        setSelectedCamera(id)
        stopStreams()
        handledRef.current = false
        setStarting(true)
        setError(null)
        try {
            startNativeLoop()
            await startZxing(id)
        } catch (e: unknown) {
            setError(
                e instanceof Error ? e.message : 'Failed to switch camera',
            )
        } finally {
            setStarting(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={480}
            contentClassName="p-0 overflow-hidden"
        >
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3 className="text-lg font-semibold heading-text">
                    {continuous ? 'Scan items with camera' : 'Scan with camera'}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {continuous
                        ? 'Point the rear camera at a barcode or QR code. Each new code is added to the cart; the camera stays open for the next item.'
                        : 'Point at a barcode or QR code. Supports Code 128, EAN, QR, and common warehouse formats.'}
                </p>
            </div>

            <div className="relative bg-black">
                <video
                    ref={videoRef}
                    className="aspect-[4/3] w-full object-cover"
                    muted
                    playsInline
                    autoPlay
                />
                <div
                    className="pointer-events-none absolute inset-8 rounded-lg border-2 border-dashed border-white/70"
                    aria-hidden
                />
                {starting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
                        Starting camera…
                    </div>
                )}
            </div>

            <div className="space-y-3 px-5 py-4">
                {cameraOptions.length > 1 && (
                    <Select
                        options={cameraOptions}
                        value={cameraOptions.find(
                            (o) => o.value === selectedCamera,
                        )}
                        onChange={(opt: CameraOption | null) =>
                            void onCameraChange(opt)
                        }
                        placeholder="Camera"
                    />
                )}
                {error && (
                    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                        {error}
                    </p>
                )}
                {continuous && lastScan && !error && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <span className="min-w-0 truncate">
                            Added{' '}
                            <span className="font-mono font-semibold">
                                {lastScan}
                            </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums">
                            {scanCount} scanned
                        </span>
                    </div>
                )}
                <Button block variant={continuous ? 'solid' : 'plain'} onClick={onClose}>
                    {continuous ? 'Done' : 'Cancel'}
                </Button>
            </div>
        </Dialog>
    )
}

export default CameraBarcodeScanner
