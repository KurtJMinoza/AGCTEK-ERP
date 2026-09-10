'use client'

/**
 * LocationSearchField — Google-style address autocomplete for SCM.
 *
 * Backend: GET /scm/places/search (Photon / OSM by default).
 * Swap provider server-side via PLACES_PROVIDER_URL or PHOTON_URL; this
 * component stays provider-agnostic through PlaceSuggestion DTO.
 */
import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import classNames from '@/utils/classNames'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { apiGetGeofences, apiSearchPlaces } from '../../services/scmApi'
import type { LocationValue, PlaceSuggestion } from '../../types'
import type { GeofenceZone } from '../../utils/geofences'

const DEBOUNCE_MS = 300
const MIN_CHARS = 3
const RECENT_KEY = 'scm.locationSearch.recent'
const RECENT_MAX = 8

type ChipSource = 'recent' | 'hubs' | 'customers'

type LocationSearchFieldProps = {
    value: string
    onChange: (next: LocationValue) => void
    placeholder?: string
    disabled?: boolean
    countryBias?: string
    className?: string
    id?: string
    /** Hide quick-filter chips */
    hideChips?: boolean
}

function readRecent(): PlaceSuggestion[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(RECENT_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as PlaceSuggestion[]
        return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : []
    } catch {
        return []
    }
}

function writeRecent(item: PlaceSuggestion) {
    if (typeof window === 'undefined') return
    const current = readRecent().filter((entry) => entry.id !== item.id)
    const next = [item, ...current].slice(0, RECENT_MAX)
    try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
        // ignore quota
    }
}

export default function LocationSearchField({
    value,
    onChange,
    placeholder = 'Search address…',
    disabled,
    countryBias,
    className,
    id,
    hideChips,
}: LocationSearchFieldProps) {
    const listboxId = useId()
    const generatedId = useId()
    const inputId = id ?? generatedId
    const rootRef = useRef<HTMLDivElement>(null)
    const inputWrapRef = useRef<HTMLDivElement>(null)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
    const [highlight, setHighlight] = useState(0)
    const [activeChip, setActiveChip] = useState<ChipSource | null>(null)
    const [recent, setRecent] = useState<PlaceSuggestion[]>([])
    const [hubs, setHubs] = useState<PlaceSuggestion[]>([])
    const [menuPos, setMenuPos] = useState<{
        top: number
        left: number
        width: number
    } | null>(null)
    const requestRef = useRef(0)

    useEffect(() => {
        setRecent(readRecent())
    }, [])

    useEffect(() => {
        let cancelled = false
        void apiGetGeofences({
            page: 1,
            pageSize: 20,
            kind: 'HUB',
            active: 'true',
        })
            .then((result) => {
                if (cancelled) return
                setHubs(
                    result.data.map((zone: GeofenceZone) => ({
                        id: `hub:${zone.id}`,
                        label: `${zone.name} (Hub)`,
                        address: zone.name,
                        lat: zone.lat,
                        lng: zone.lng,
                        city: null,
                        postalCode: null,
                        country: null,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setHubs([])
            })
        return () => {
            cancelled = true
        }
    }, [])

    const updateMenuPos = useCallback(() => {
        const el = inputWrapRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        setMenuPos({
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        })
    }, [])

    useLayoutEffect(() => {
        if (!open) return
        updateMenuPos()
        const onScrollOrResize = () => updateMenuPos()
        window.addEventListener('resize', onScrollOrResize)
        window.addEventListener('scroll', onScrollOrResize, true)
        return () => {
            window.removeEventListener('resize', onScrollOrResize)
            window.removeEventListener('scroll', onScrollOrResize, true)
        }
    }, [open, suggestions.length, updateMenuPos])

    const emitFreeText = useCallback(
        (address: string) => {
            onChange({
                address,
                lat: null,
                lng: null,
                city: null,
                postalCode: null,
                raw: null,
            })
        },
        [onChange],
    )

    const selectSuggestion = useCallback(
        (item: PlaceSuggestion) => {
            writeRecent(item)
            setRecent(readRecent())
            onChange({
                address: item.address,
                lat: item.lat,
                lng: item.lng,
                city: item.city ?? null,
                postalCode: item.postalCode ?? null,
                raw: item,
            })
            setOpen(false)
            setActiveChip(null)
            setSuggestions([])
            setHighlight(0)
        },
        [onChange],
    )

    useEffect(() => {
        if (activeChip === 'recent') {
            setSuggestions(recent)
            setOpen(recent.length > 0)
            setHighlight(0)
            return
        }
        if (activeChip === 'hubs') {
            setSuggestions(hubs)
            setOpen(hubs.length > 0)
            setHighlight(0)
            return
        }
        if (activeChip === 'customers') {
            setSuggestions([])
            setOpen(false)
            return
        }

        const q = value.trim()
        if (q.length < MIN_CHARS) {
            setSuggestions([])
            setLoading(false)
            return
        }

        const handle = window.setTimeout(() => {
            const reqId = ++requestRef.current
            setLoading(true)
            void apiSearchPlaces({
                q,
                limit: 6,
                country: countryBias,
            })
                .then((data) => {
                    if (reqId !== requestRef.current) return
                    setSuggestions(data)
                    setOpen(true)
                    setHighlight(0)
                })
                .catch(() => {
                    if (reqId !== requestRef.current) return
                    setSuggestions([])
                    setOpen(true)
                })
                .finally(() => {
                    if (reqId === requestRef.current) setLoading(false)
                })
        }, DEBOUNCE_MS)

        return () => window.clearTimeout(handle)
    }, [value, countryBias, activeChip, recent, hubs])

    useEffect(() => {
        const onDocMouseDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (rootRef.current?.contains(target)) return
            const portal = document.getElementById(listboxId)
            if (portal?.contains(target)) return
            setOpen(false)
            setActiveChip(null)
        }
        document.addEventListener('mousedown', onDocMouseDown)
        return () => document.removeEventListener('mousedown', onDocMouseDown)
    }, [listboxId])

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setOpen(false)
            setActiveChip(null)
            return
        }
        if (!open || suggestions.length === 0) return

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((current) => (current + 1) % suggestions.length)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight(
                (current) =>
                    (current - 1 + suggestions.length) % suggestions.length,
            )
        } else if (event.key === 'Enter') {
            event.preventDefault()
            const item = suggestions[highlight]
            if (item) selectSuggestion(item)
        }
    }

    const showRecent = recent.length > 0
    const showHubs = hubs.length > 0
    const showCustomers = false

    const listbox =
        open && menuPos && typeof document !== 'undefined'
            ? createPortal(
                  <ul
                      id={listboxId}
                      role="listbox"
                      aria-label="Address suggestions"
                      style={{
                          position: 'fixed',
                          top: menuPos.top,
                          left: menuPos.left,
                          width: menuPos.width,
                      }}
                      className="z-[80] max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                  >
                      {loading && suggestions.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-gray-500">
                              Searching…
                          </li>
                      ) : null}
                      {!loading && suggestions.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-gray-500">
                              {value.trim().length < MIN_CHARS && !activeChip
                                  ? `Type at least ${MIN_CHARS} characters`
                                  : 'No places found — you can keep the typed address'}
                          </li>
                      ) : null}
                      {suggestions.map((item, index) => (
                          <li
                              key={item.id}
                              id={`${listboxId}-option-${index}`}
                              role="option"
                              aria-selected={index === highlight}
                              className={classNames(
                                  'cursor-pointer px-3 py-2 text-sm',
                                  index === highlight
                                      ? 'bg-primary-subtle text-primary'
                                      : 'text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800',
                              )}
                              onMouseEnter={() => setHighlight(index)}
                              onMouseDown={(e) => {
                                  e.preventDefault()
                                  selectSuggestion(item)
                              }}
                          >
                              <p className="font-medium leading-snug">
                                  {item.label}
                              </p>
                              {item.label !== item.address ? (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                      {item.address}
                                  </p>
                              ) : null}
                          </li>
                      ))}
                  </ul>,
                  document.body,
              )
            : null

    return (
        <div ref={rootRef} className={classNames('relative w-full', className)}>
            <label className="sr-only" htmlFor={inputId}>
                Location search
            </label>
            <div ref={inputWrapRef} className="relative">
                <Input
                    id={inputId}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        open && suggestions[highlight]
                            ? `${listboxId}-option-${highlight}`
                            : undefined
                    }
                    disabled={disabled}
                    placeholder={placeholder}
                    value={value}
                    autoComplete="off"
                    onFocus={() => {
                        updateMenuPos()
                        if (
                            suggestions.length > 0 ||
                            value.trim().length >= MIN_CHARS
                        ) {
                            setOpen(true)
                        }
                    }}
                    onChange={(e) => {
                        setActiveChip(null)
                        emitFreeText(e.target.value)
                    }}
                    onKeyDown={onKeyDown}
                />
                {loading ? (
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                        <Spinner size={18} />
                    </span>
                ) : null}
            </div>

            {!hideChips && (showRecent || showHubs || showCustomers) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {showRecent ? (
                        <ChipButton
                            active={activeChip === 'recent'}
                            onClick={() =>
                                setActiveChip((current) =>
                                    current === 'recent' ? null : 'recent',
                                )
                            }
                        >
                            Recent
                        </ChipButton>
                    ) : null}
                    {showHubs ? (
                        <ChipButton
                            active={activeChip === 'hubs'}
                            onClick={() =>
                                setActiveChip((current) =>
                                    current === 'hubs' ? null : 'hubs',
                                )
                            }
                        >
                            Hubs
                        </ChipButton>
                    ) : null}
                    {showCustomers ? (
                        <ChipButton
                            active={activeChip === 'customers'}
                            onClick={() =>
                                setActiveChip((current) =>
                                    current === 'customers'
                                        ? null
                                        : 'customers',
                                )
                            }
                        >
                            Customers
                        </ChipButton>
                    ) : null}
                </div>
            ) : null}

            {listbox}
        </div>
    )
}

function ChipButton({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={classNames(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300',
            )}
        >
            {children}
        </button>
    )
}
