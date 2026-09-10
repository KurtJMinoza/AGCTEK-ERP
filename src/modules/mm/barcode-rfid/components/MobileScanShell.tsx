'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineQrcode } from 'react-icons/hi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

type Props = {
    route: string
    title: string
    description: string
    barcode: string
    onBarcodeChange: (v: string) => void
    onScan: () => void
    scanning?: boolean
    confirmLabel?: string
    onConfirm?: () => void
    confirming?: boolean
    children?: ReactNode
    feedback?: { type: 'success' | 'danger' | 'info'; message: string } | null
}

const MobileScanShell = ({
    route,
    title,
    description,
    barcode,
    onBarcodeChange,
    onScan,
    scanning,
    confirmLabel = 'Confirm',
    onConfirm,
    confirming,
    children,
    feedback,
}: Props) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const breadcrumbItems = buildErpBreadcrumbs(route)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader title={title} description={description} />

            <AdaptiveCard className="mb-4">
                <FormItem label="Scan barcode">
                    <Input
                        ref={inputRef as any}
                        className="text-2xl h-16 font-mono tracking-wide"
                        placeholder="Scan or type barcode…"
                        value={barcode}
                        onChange={(e: any) => onBarcodeChange(e.target.value)}
                        onKeyDown={(e: any) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                onScan()
                            }
                        }}
                        autoComplete="off"
                        autoFocus
                    />
                </FormItem>
                <div className="flex flex-col gap-3 mt-4 sm:flex-row">
                    <Button
                        size="lg"
                        variant="solid"
                        className="h-14 text-lg flex-1"
                        icon={<HiOutlineQrcode />}
                        loading={scanning}
                        onClick={onScan}
                    >
                        Lookup / Scan
                    </Button>
                    {onConfirm && (
                        <Button
                            size="lg"
                            className="h-14 text-lg flex-1"
                            variant="solid"
                            loading={confirming}
                            onClick={onConfirm}
                        >
                            {confirmLabel}
                        </Button>
                    )}
                </div>
                {feedback && (
                    <div
                        className={`mt-4 rounded-lg p-4 text-base font-medium ${
                            feedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                : feedback.type === 'danger'
                                  ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                                  : 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        }`}
                    >
                        {feedback.message}
                    </div>
                )}
            </AdaptiveCard>

            {children}
        </PageContainer>
    )
}

export default MobileScanShell
