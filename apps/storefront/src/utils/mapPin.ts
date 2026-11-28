/** Vector style with 3D buildings (same provider family as OpenStreetMap data). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export const MANILA_PIN = { latitude: 14.5995, longitude: 120.9842 }
export const DAVAO_PIN = { latitude: 7.0731, longitude: 125.6128 }

/** Best-effort initial map center from typed city / region (Philippines defaults). */
export function initialPinForText(city: string, region: string): { latitude: number; longitude: number } {
    const text = `${city} ${region}`.toLowerCase()
    if (text.includes('davao')) return DAVAO_PIN
    if (text.includes('cebu')) return { latitude: 10.3157, longitude: 123.8854 }
    if (text.includes('cagayan') || text.includes('cdo')) return { latitude: 8.4542, longitude: 124.6319 }
    if (text.includes('iloilo')) return { latitude: 10.7202, longitude: 122.5621 }
    if (text.includes('baguio')) return { latitude: 16.4023, longitude: 120.596 }
    if (text.includes('zamboanga')) return { latitude: 6.9214, longitude: 122.079 }
    if (text.includes('general santos') || text.includes('gensan')) return { latitude: 6.1164, longitude: 125.1716 }
    return MANILA_PIN
}