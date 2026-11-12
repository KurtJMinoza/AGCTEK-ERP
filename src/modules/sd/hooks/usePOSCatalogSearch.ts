'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RetailProduct } from '@/types/storefront/retail'
import {
    lookupProductBarcode,
    type BarcodeLookup,
} from '../services/productBarcodeService'

/** Rows shown in the live-search dropdown. */
const MAX_RESULTS = 8

/** Wait this long before asking the barcode registry about a typed code. */
const BARCODE_LOOKUP_MS = 300

/**
 * Codes worth a registry lookup: one token (no spaces), at least one digit.
 * Product names are never barcode candidates, so a name search costs no call.
 */
const LOOKS_LIKE_CODE = /^(?=.*\d)[A-Za-z0-9._-]{4,64}$/

export type POSBarcodeHit = {
    code: string
    result: BarcodeLookup
}

/**
 * Live search for the POS scan field.
 *
 * Local catalog matches are instant (name / SKU / item id). When the typed text
 * looks like a code and no product matches, the centralized barcode registry is
 * asked once after a short debounce — the same lookup MM, SD and the barcode
 * dialog use. Nothing here decides stock; adding to the cart still goes through
 * the live ATP check.
 */
export function usePOSCatalogSearch(products: RetailProduct[], query: string) {
    const text = query.trim()
    const normalized = text.toLowerCase()

    const matches = useMemo(() => {
        if (!normalized) return []
        const scored: Array<{ product: RetailProduct; score: number }> = []
        for (const product of products) {
            const sku = product.sku.toLowerCase()
            const name = product.name.toLowerCase()
            let score = -1
            if (sku === normalized) score = 0
            else if (product.itemId.toLowerCase() === normalized) score = 1
            else if (sku.startsWith(normalized)) score = 2
            else if (name.startsWith(normalized)) score = 3
            else if (sku.includes(normalized)) score = 4
            else if (name.includes(normalized)) score = 5
            if (score >= 0) scored.push({ product, score })
        }
        scored.sort(
            (a, b) =>
                a.score - b.score ||
                a.product.name.localeCompare(b.product.name),
        )
        return scored.slice(0, MAX_RESULTS).map((row) => row.product)
    }, [products, normalized])

    const [barcode, setBarcode] = useState<POSBarcodeHit | null>(null)

    useEffect(() => {
        // The stored hit is only returned when its code still equals the typed
        // text, so a stale result never needs an explicit reset here.
        if (!LOOKS_LIKE_CODE.test(text) || matches.length > 0) return
        let cancelled = false
        const timer = window.setTimeout(() => {
            lookupProductBarcode(text)
                .then((result) => {
                    if (!cancelled) setBarcode({ code: text, result })
                })
                .catch(() => {
                    if (!cancelled) setBarcode(null)
                })
        }, BARCODE_LOOKUP_MS)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [text, matches.length])

    return {
        /** Catalog products matching the typed text, best match first. */
        products: matches,
        /** Exact barcode-registry hit, only when no catalog product matched. */
        barcode: matches.length === 0 && barcode?.code === text ? barcode : null,
    }
}
