'use client'

import Link from 'next/link'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import {
    WmPartyCell,
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'
import {
    HiOutlineArrowSmRight,
    HiOutlineBeaker,
    HiOutlineClipboardCheck,
    HiOutlineClock,
    HiOutlineCog,
    HiOutlineCube,
    HiOutlineDocumentText,
    HiOutlineExclamation,
    HiOutlineLink,
    HiOutlineOfficeBuilding,
    HiOutlineRefresh,
    HiOutlineReply,
    HiOutlineSwitchHorizontal,
    HiOutlineTruck,
} from 'react-icons/hi'
import type { IconType } from 'react-icons'
import type {
    MmExceptionDomain,
    MmExceptionItem,
    MmExceptionSeverity,
} from '../types'

export const excTableRowEnterClass = wmTableRowEnterClass

export function excTableRowClass(item: MmExceptionItem, index: number): string {
    const base = wmTableRowEnterClass(index)
    const accent =
        item.severity === 'CRITICAL'
            ? 'border-l-2 border-l-rose-500/80 dark:border-l-rose-400/70'
            : item.stale
              ? 'border-l-2 border-l-amber-400/80 dark:border-l-amber-400/60'
              : 'border-l-2 border-l-transparent'
    const tint =
        item.severity === 'CRITICAL'
            ? 'bg-rose-50/40 dark:bg-rose-950/10'
            : item.stale
              ? 'bg-amber-50/40 dark:bg-amber-950/15'
              : ''
    return [base, accent, tint].filter(Boolean).join(' ')
}

const SEVERITY_TONE: Record<MmExceptionSeverity, StatusTone> = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'default',
}

const SEVERITY_DOT: Record<MmExceptionSeverity, string> = {
    CRITICAL: 'bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]',
    HIGH: 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]',
    MEDIUM: 'bg-sky-500',
    LOW: 'bg-gray-400',
}

const SEVERITY_TEXT: Record<MmExceptionSeverity, string> = {
    CRITICAL: 'text-rose-600 dark:text-rose-400',
    HIGH: 'text-amber-600 dark:text-amber-400',
    MEDIUM: 'text-sky-600 dark:text-sky-400',
    LOW: 'text-gray-500 dark:text-gray-400',
}

const SEVERITY_LABEL: Record<MmExceptionSeverity, string> = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
}

const PULSE_SEVERITIES = new Set<MmExceptionSeverity>(['CRITICAL', 'HIGH'])

const DOMAIN_META: Record<
    MmExceptionDomain,
    { label: string; Icon: IconType; tile: string; chip: string }
> = {
    procurement: {
        label: 'Procurement',
        Icon: HiOutlineTruck,
        tile: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
        chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
    },
    receiving: {
        label: 'Receiving',
        Icon: HiOutlineClipboardCheck,
        tile: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
    },
    quality: {
        label: 'Quality',
        Icon: HiOutlineBeaker,
        tile: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
        chip: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200',
    },
    inventory: {
        label: 'Inventory',
        Icon: HiOutlineCube,
        tile: 'bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light',
        chip: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    },
    warehouse: {
        label: 'Warehouse',
        Icon: HiOutlineOfficeBuilding,
        tile: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    },
    inventory_control: {
        label: 'Inv. control',
        Icon: HiOutlineClipboardCheck,
        tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
        chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200',
    },
    transfers: {
        label: 'Transfers',
        Icon: HiOutlineSwitchHorizontal,
        tile: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
        chip: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200',
    },
    mrp: {
        label: 'MRP',
        Icon: HiOutlineRefresh,
        tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    },
    integration: {
        label: 'Integration',
        Icon: HiOutlineLink,
        tile: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    },
    returns_disposal: {
        label: 'Returns',
        Icon: HiOutlineReply,
        tile: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
        chip: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
    },
    supporting_ops: {
        label: 'Support ops',
        Icon: HiOutlineCog,
        tile: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
        chip: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200',
    },
}

function domainMeta(domain: MmExceptionDomain) {
    return (
        DOMAIN_META[domain] ?? {
            label: domain.replaceAll('_', ' '),
            Icon: HiOutlineExclamation,
            tile: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
            chip: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        }
    )
}

/** `MmPurchaseOrder` → `Purchase order` — keeps provenance readable without leaking model names. */
function humanizeSource(source: string) {
    const stripped = source.replace(/^(Mm|Wm)/, '').replaceAll('_', ' ')
    const spaced = stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function fmtExceptionAge(hours: number) {
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

function SeverityDot({ severity }: { severity: MmExceptionSeverity }) {
    return (
        <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severity]} ${
                PULSE_SEVERITIES.has(severity)
                    ? 'animate-mm-status-pulse motion-reduce:animate-none'
                    : ''
            }`}
        />
    )
}

/**
 * Row identity: domain tile + title + issue/source line.
 * The `@container` variants mirror the column visibility so the row keeps its
 * severity, age and domain context whenever the dedicated columns are hidden.
 */
export function ExceptionIssueCell({ item }: { item: MmExceptionItem }) {
    const meta = domainMeta(item.domain)
    const Icon = meta.Icon
    return (
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 sm:h-9 sm:w-9 dark:ring-white/10 ${meta.tile} ${wmIconPopClass(60)}`}
            >
                <Icon className="text-base sm:text-lg" />
                {item.stale ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-amber-400 dark:border-gray-900"
                        title="Stale exception"
                    />
                ) : null}
            </span>
            <div className="min-w-0 flex-1">
                <p
                    className="line-clamp-2 text-[13px] leading-5 font-semibold break-words text-gray-900 sm:line-clamp-1 dark:text-gray-100"
                    title={item.title}
                >
                    {item.title}
                </p>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px]">
                    <span className="truncate font-mono tracking-wide text-gray-500 uppercase dark:text-gray-400">
                        {item.type.replaceAll('_', ' ')}
                    </span>
                    <span className="hidden shrink-0 text-gray-300 sm:inline">
                        ·
                    </span>
                    <span className="hidden truncate text-gray-400 sm:inline">
                        {humanizeSource(item.source)}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 @3xl:hidden">
                    <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase @md:hidden ${SEVERITY_TEXT[item.severity]}`}
                    >
                        <SeverityDot severity={item.severity} />
                        {SEVERITY_LABEL[item.severity]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 tabular-nums @xl:hidden dark:text-gray-400">
                        <HiOutlineClock className="text-[11px]" />
                        {fmtExceptionAge(item.ageHours)}
                        {item.stale ? (
                            <span className="font-bold text-amber-600 uppercase dark:text-amber-400">
                                stale
                            </span>
                        ) : null}
                    </span>
                    <ExceptionDomainChip domain={item.domain} compact />
                </div>
                {item.message ? (
                    <p
                        className="mt-1 hidden truncate text-[11px] text-gray-500 @3xl:block"
                        title={item.message}
                    >
                        {item.message}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function ExceptionSeverityCell({
    severity,
}: {
    severity: MmExceptionSeverity
}) {
    return (
        <StatusBadge
            tone={SEVERITY_TONE[severity]}
            className="gap-1.5 rounded-full px-2 py-0.5 text-[10px] tracking-wide whitespace-nowrap uppercase ring-1 ring-inset ring-black/5 dark:ring-white/10"
            prefix={<SeverityDot severity={severity} />}
        >
            {severity}
        </StatusBadge>
    )
}

export function ExceptionDomainChip({
    domain,
    compact = false,
}: {
    domain: MmExceptionDomain
    compact?: boolean
}) {
    const meta = domainMeta(domain)
    const Icon = meta.Icon
    return (
        <span
            className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${meta.chip}`}
            title={meta.label}
        >
            {compact ? null : <Icon className="shrink-0 text-[11px]" />}
            <span className="truncate">{meta.label}</span>
        </span>
    )
}

export function ExceptionDocumentCell({
    document,
}: {
    document?: MmExceptionItem['document']
}) {
    const label = document?.number ?? document?.id
    if (!label) {
        return <span className="text-xs text-gray-400">—</span>
    }
    const typeHint = document?.type?.replaceAll('_', ' ')
    return (
        <div className="min-w-0">
            <span
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-sky-200/70 bg-sky-50 px-1.5 py-1 font-mono text-[11px] font-semibold text-sky-800 dark:border-sky-500/20 dark:bg-sky-950/40 dark:text-sky-200"
                title={label}
            >
                <HiOutlineDocumentText className="shrink-0 text-xs" />
                <span className="truncate">{label}</span>
            </span>
            {typeHint ? (
                <p
                    className="mt-0.5 truncate text-[9px] tracking-wide text-gray-400 uppercase"
                    title={typeHint}
                >
                    {typeHint}
                </p>
            ) : null}
        </div>
    )
}

export function ExceptionAgeCell({
    ageHours,
    stale,
}: {
    ageHours: number
    stale: boolean
}) {
    const tone = stale
        ? {
              text: 'text-amber-600 dark:text-amber-400',
              bar: 'bg-amber-500',
              track: 'bg-amber-100 dark:bg-amber-500/15',
          }
        : ageHours >= 72
          ? {
                text: 'text-orange-600 dark:text-orange-400',
                bar: 'bg-orange-500',
                track: 'bg-orange-100 dark:bg-orange-500/15',
            }
          : ageHours >= 24
            ? {
                  text: 'text-amber-600 dark:text-amber-400',
                  bar: 'bg-amber-500',
                  track: 'bg-amber-100 dark:bg-amber-500/15',
              }
            : {
                  text: 'text-emerald-600 dark:text-emerald-400',
                  bar: 'bg-emerald-500',
                  track: 'bg-emerald-100 dark:bg-emerald-500/15',
              }

    // Age meter is capped at 14 days; anything older simply reads full.
    const fill = Math.max(8, Math.min(100, (ageHours / (14 * 24)) * 100))

    return (
        <div
            className="min-w-[3rem]"
            title={`Detected ${fmtExceptionAge(ageHours)} ago${stale ? ' · stale' : ''}`}
        >
            <div className="flex items-center gap-1">
                <HiOutlineClock
                    className={`shrink-0 text-[13px] ${tone.text}`}
                />
                <span
                    className={`text-xs font-semibold tabular-nums ${tone.text}`}
                >
                    {fmtExceptionAge(ageHours)}
                </span>
            </div>
            <div
                className={`mt-1 h-1 w-full max-w-[3.25rem] overflow-hidden rounded-full ${tone.track}`}
            >
                <span
                    className={`block h-full origin-left rounded-full ${tone.bar} animate-mm-progress-grow motion-reduce:animate-none`}
                    style={{ width: `${fill}%` }}
                />
            </div>
            {stale ? (
                <p className="mt-0.5 text-[9px] font-bold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                    Stale
                </p>
            ) : null}
        </div>
    )
}

export function ExceptionOwnerCell({ owner }: { owner?: string | null }) {
    if (!owner?.trim()) {
        return <span className="text-xs text-gray-400">Unassigned</span>
    }
    return <WmPartyCell name={owner} subtitle="Owner" />
}

export function ExceptionActionCell({
    href,
    recommendedAction,
}: {
    href: string
    recommendedAction: string
}) {
    return (
        <div className="flex justify-center md:justify-end">
            <Link
                href={href}
                title={recommendedAction}
                aria-label={recommendedAction}
                className="group/action inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary-subtle/60 hover:text-primary dark:border-gray-600 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-primary/40 dark:hover:bg-primary/10 dark:hover:text-primary-light md:h-auto md:w-auto md:gap-1.5 md:px-2.5 md:py-1.5"
            >
                <span className="hidden text-[11px] font-semibold whitespace-nowrap @md:inline">
                    Resolve
                </span>
                <HiOutlineArrowSmRight className="shrink-0 text-sm transition-transform duration-200 group-hover/action:translate-x-0.5" />
            </Link>
        </div>
    )
}
