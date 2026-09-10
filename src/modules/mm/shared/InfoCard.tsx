'use client'

type InfoCardProps = {
    label: string
    value?: string | null
}

const InfoCard = ({ label, value }: InfoCardProps) => (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
    </div>
)

export default InfoCard
