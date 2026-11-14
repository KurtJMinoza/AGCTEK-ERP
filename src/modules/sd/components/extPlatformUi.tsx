import { useId, type ComponentType, type CSSProperties } from 'react'
import { SiFacebook, SiShopee, SiTiktok } from 'react-icons/si'
import { MdOutlineLocalShipping, MdOutlinePointOfSale, MdOutlineStorefront } from 'react-icons/md'
import { HiOutlineGlobeAlt, HiOutlineTag, HiOutlineUserGroup } from 'react-icons/hi'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'

type IconProps = { className?: string; style?: CSSProperties }

/** Lazada heart mark; Simple Icons has no Lazada logo. Swap in the official SVG if brand assets are provided. */
function LazadaIcon({ className, style }: IconProps) {
    const gradientId = useId()
    return (
        <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFA200" />
                    <stop offset="50%" stopColor="#F3216F" />
                    <stop offset="100%" stopColor="#3D1CA8" />
                </linearGradient>
            </defs>
            <path
                fill={`url(#${gradientId})`}
                d="M12 21.6 3.4 14.2A5.6 5.6 0 0 1 12 6.5a5.6 5.6 0 0 1 8.6 7.7Z"
            />
            <path fill="#fff" d="M12 10.4 9.3 12.9 12 15.6l2.7-2.7Z" opacity=".9" />
        </svg>
    )
}

/** Brand logos keep their brand colour; generic channels inherit the text colour. */
const SOURCE_ICONS: Record<string, { Icon: ComponentType<IconProps>; color?: string }> = {
    POS: { Icon: MdOutlinePointOfSale },
    OWN_ECOMMERCE: { Icon: MdOutlineStorefront },
    SHOPEE: { Icon: SiShopee, color: '#EE4D2D' },
    LAZADA: { Icon: LazadaIcon },
    TIKTOK_SHOP: { Icon: SiTiktok },
    FB_MARKETPLACE: { Icon: SiFacebook, color: '#0866FF' },
    DISTRIBUTOR: { Icon: MdOutlineLocalShipping },
    RESELLER: { Icon: HiOutlineUserGroup },
    OTHER: { Icon: HiOutlineGlobeAlt },
}

/** Channel logo by sales source code; admin-added sources get a generic tag. */
export function SourceIcon({ code, className }: { code?: string | null; className?: string }) {
    const { Icon, color } = SOURCE_ICONS[code ?? ''] ?? { Icon: HiOutlineTag }
    return <Icon className={className} style={color ? { color } : undefined} />
}

const SOURCE_BADGE_COLORS: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

export const sourceColorClass = (badgeColor?: string | null) =>
    SOURCE_BADGE_COLORS[badgeColor ?? 'gray'] ?? SOURCE_BADGE_COLORS.gray

export function SourceBadge({
    source,
}: {
    source: { name: string; code?: string | null; badgeColor?: string | null }
}) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${sourceColorClass(source.badgeColor)}`}
        >
            <SourceIcon code={source.code} className="h-3.5 w-3.5 shrink-0" />
            {source.name}
        </span>
    )
}

const TAX_CLASS_META: Record<string, { label: string; className: string }> = {
    VATABLE: { label: 'VATable', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    VAT_EXEMPT: { label: 'VAT-exempt', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    ZERO_RATED: { label: 'Zero-rated', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

/** Tax classification chip; the rate is appended for VATable lines. */
export function TaxClassTag({
    classification,
    taxCode,
    taxRate,
}: {
    classification: string | null
    taxCode?: string | null
    taxRate?: number | null
}) {
    const meta = classification ? TAX_CLASS_META[classification] : undefined
    if (!meta) {
        return (
            <Tooltip title="No tax classification or FICO tax code on this material. Set it in MM Material Master.">
                <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    No tax setup
                </Tag>
            </Tooltip>
        )
    }
    const rate = classification === 'VATABLE' && taxRate ? ` ${taxRate}%` : ''
    return (
        <Tooltip title={taxCode ? `FICO tax code ${taxCode}` : meta.label}>
            <Tag className={meta.className}>
                {meta.label}
                {rate}
            </Tag>
        </Tooltip>
    )
}
