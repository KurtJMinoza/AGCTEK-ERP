import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { Marker, type MarkerProps } from 'react-leaflet'

type LatLngTuple = [number, number]

type SmoothMarkerProps = Omit<MarkerProps, 'position'> & {
    position: LatLngTuple
    /** Slide duration in ms (0 = snap). */
    durationMs?: number
}

/**
 * Leaflet marker that eases between GPS updates instead of teleporting.
 * React-Leaflet applies `position` instantly; we briefly rewind and animate.
 */
export default function SmoothMarker({
    position,
    durationMs = 450,
    ...rest
}: SmoothMarkerProps) {
    const markerRef = useRef<L.Marker | null>(null)
    const fromRef = useRef<LatLngTuple>(position)
    const rafRef = useRef<number>(0)

    useEffect(() => {
        const marker = markerRef.current
        if (!marker) return

        const [toLat, toLng] = position
        const [fromLat, fromLng] = fromRef.current

        if (
            Math.abs(fromLat - toLat) < 1e-7 &&
            Math.abs(fromLng - toLng) < 1e-7
        ) {
            return
        }

        cancelAnimationFrame(rafRef.current)

        if (durationMs <= 0) {
            marker.setLatLng(position)
            fromRef.current = position
            return
        }

        // Undo React-Leaflet's instant jump, then ease to the new ping.
        marker.setLatLng([fromLat, fromLng])
        const start = performance.now()

        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs)
            const eased = 1 - (1 - t) * (1 - t)
            marker.setLatLng([
                fromLat + (toLat - fromLat) * eased,
                fromLng + (toLng - fromLng) * eased,
            ])
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick)
            } else {
                fromRef.current = position
            }
        }

        rafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafRef.current)
    }, [position[0], position[1], durationMs])

    return (
        <Marker
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={markerRef as any}
            position={position}
            {...rest}
        />
    )
}
