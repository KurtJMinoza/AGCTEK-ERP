import * as WebBrowser from 'expo-web-browser'
import { WEB_BASE } from '../api/client'
import type { DeliveryEta } from '../types'

/** Public read-only tracking page on the web marketplace (map + timeline). */
export const trackingUrl = (token: string) =>
    `${WEB_BASE}/shop/track/${encodeURIComponent(token)}`

/** Opens an in-app web path (e.g. a notification's `/shop/track/<token>`). */
export const openWebPath = (path: string) => WebBrowser.openBrowserAsync(`${WEB_BASE}${path}`)

const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const formatEtaWindow = (eta: DeliveryEta) => `${time(eta.from)} – ${time(eta.to)}`
