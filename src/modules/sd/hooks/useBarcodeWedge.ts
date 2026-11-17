'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { createWedgeDetector } from './barcodeWedge'

type TextField = HTMLInputElement | HTMLTextAreaElement

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image'])

function asTextField(el: EventTarget | null): TextField | null {
    if (el instanceof HTMLTextAreaElement) return el
    if (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type)) return el
    return null
}

const isEditable = (el: EventTarget | null) =>
    asTextField(el) !== null ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)

/** Puts back a React-controlled field's value (the native setter + input event keeps React in sync). */
function restoreValue(el: TextField, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

const openModalCount = () => document.querySelectorAll('[aria-modal="true"]').length

type Options = {
    enabled: boolean
    /** The POS scan field; keystrokes there use its own Enter handling. */
    inputRef: RefObject<HTMLInputElement | null>
    onScan: (code: string) => void
    /** Allows scans while a dialog is open (e.g. the receipt of the last sale). */
    allowInModal?: () => boolean
}

/**
 * Catches USB barcode-scanner input anywhere on the POS terminal:
 * - focus on the page, a button or a cart row → the keystroke is moved to the
 *   scan field, so scanning (or typing) lands there and Enter adds it;
 * - focus in another text field → a scanner-speed burst ending in Enter/Tab is
 *   taken out of that field and sent to `onScan`;
 * - a dialog is open → ignored unless `allowInModal` says otherwise, so a scan
 *   never types into the tender or variant dialogs.
 */
export function useBarcodeWedge({ enabled, inputRef, onScan, allowInModal }: Options) {
    const onScanRef = useRef(onScan)
    const allowInModalRef = useRef(allowInModal)
    useEffect(() => {
        onScanRef.current = onScan
        allowInModalRef.current = allowInModal
    })

    useEffect(() => {
        if (!enabled) return
        const detector = createWedgeDetector()
        let field: { el: TextField; value: string } | null = null
        const reset = () => {
            detector.reset()
            field = null
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
            const scanField = inputRef.current
            if (!scanField || event.target === scanField) {
                reset()
                return
            }
            const inModal = openModalCount() > 0
            if (inModal && !allowInModalRef.current?.()) {
                reset()
                return
            }

            const now = performance.now()
            if (event.key.length === 1) {
                if (!inModal && !isEditable(event.target)) {
                    // Focus moved before the character is inserted, so it lands in the scan field.
                    scanField.focus()
                    reset()
                    return
                }
                if (detector.push(event.key, now)) {
                    const el = asTextField(event.target)
                    field = el ? { el, value: el.value } : null
                }
                // Inside a dialog the keys would only press focused buttons.
                if (inModal) event.preventDefault()
                return
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
                const code = detector.commit(now)
                if (code) {
                    event.preventDefault()
                    event.stopPropagation()
                    if (field) restoreValue(field.el, field.value)
                    field = null
                    onScanRef.current(code)
                }
                return
            }

            if (event.key !== 'Shift' && event.key !== 'CapsLock') reset()
        }

        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [enabled, inputRef])
}
