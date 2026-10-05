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
    /** Fired once per successful decode; dialog closes afterward. */
    onDetected: (value: string) => void
}

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

const CameraBarcodeScanner = ({ isOpen, onClose, onDetected }: Props) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const scannerControlsRef = useRef<IScannerControls | null>(null)
    const nativeLoopRef = useRef<number | null>(null)
    const handledRef = useRef(false)

    const [error, setError] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)
    const [cameraOptions, setCameraOptions] = useState<CameraOption[]>([])
    const [selectedCamera, setSelectedCamera] = useState<string>('')

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
            if (handledRef.current) return
            handledRef.current = true
            stopStreams()
            onDetected(value)
            onClose()
        },
        [onClose, onDetected, stopStreams],
    )

    const startNativeLoop = useCallback(() => {
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
            return
        }

        let cancelled = false

        const boot = async () => {
            setStarting(true)
            setError(null)
            handledRef.current = false

            try {
                const devices =
                    await BrowserMultiFormatReader.listVideoInputDevices()
                if (cancelled) return

                if (!devices.length) {
                    setError(
                        'No camera found. Use HTTPS or localhost and allow camera permission.',
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
                    Scan with camera
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Point at a barcode or QR code. Supports Code 128, EAN, QR,
                    and common warehouse formats.
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
                <Button block variant="plain" onClick={onClose}>
                    Cancel
                </Button>
            </div>
        </Dialog>
    )
}

export default CameraBarcodeScanner
