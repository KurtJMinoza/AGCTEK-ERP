'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import ErpIcon from '@/components/erp/ErpIcon'
import {
    HiOutlineCamera,
    HiOutlineQrcode,
    HiOutlineDeviceMobile,
} from 'react-icons/hi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const CameraBarcodeScanner = dynamic(
    () => import('./CameraBarcodeScanner'),
    { ssr: false },
)

export type ScanFeedback = {
    type: 'success' | 'danger' | 'info'
    message: string
    title?: string
}

type Props = {
    route: string
    title: string
    description: string
    /** ErpIcon key, e.g. package, clipboard, warehouse */
    icon?: string
    /** Short workflow label shown under the module tag */
    workflowLabel?: string
    barcode: string
    onBarcodeChange: (v: string) => void
    onScan: (barcodeOverride?: string) => void | Promise<void>
    scanning?: boolean
    confirmLabel?: string
    onConfirm?: () => void
    confirming?: boolean
    children?: ReactNode
    feedback?: ScanFeedback | null
    /** Optional ordered steps shown above the scan card (mobile ops). */
    workflowSteps?: string[]
}

const feedbackAlertType = (
    type: ScanFeedback['type'],
): 'success' | 'danger' | 'info' => type

const MobileScanShell = ({
    route,
    title,
    description,
    icon = 'fileText',
    workflowLabel,
    barcode,
    onBarcodeChange,
    onScan,
    scanning,
    confirmLabel = 'Confirm',
    onConfirm,
    confirming,
    children,
    feedback,
    workflowSteps,
}: Props) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const breadcrumbItems = buildErpBreadcrumbs(route)
    const [cameraOpen, setCameraOpen] = useState(false)

    const handleCameraDetected = useCallback(
        (value: string) => {
            const trimmed = value.trim()
            if (!trimmed) return
            onBarcodeChange(trimmed)
            void onScan(trimmed)
        },
        [onBarcodeChange, onScan],
    )

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                icon={
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep">
                        <ErpIcon icon={icon} className="text-xl" />
                    </span>
                }
                title={title}
                description={
                    <span className="flex flex-col gap-2">
                        <span>{description}</span>
                        <span className="flex flex-wrap items-center gap-2">
                            <Tag className="text-xs font-semibold uppercase tracking-wide">
                                Materials Management
                            </Tag>
                            <Tag className="border-primary/20 bg-primary-subtle text-xs font-semibold text-primary-deep">
                                Barcode / RFID
                            </Tag>
                            {workflowLabel ? (
                                <Tag className="text-xs">{workflowLabel}</Tag>
                            ) : null}
                        </span>
                    </span>
                }
            />

            {workflowSteps && workflowSteps.length > 0 ? (
                <AdaptiveCard className="mb-6" bodyClass="py-4">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-gray-400">
                            <HiOutlineDeviceMobile className="text-xl" />
                        </span>
                        <ol className="flex flex-1 flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
                            {workflowSteps.map((step, i) => (
                                <li
                                    key={step}
                                    className="flex items-center gap-2"
                                >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                        {i + 1}
                                    </span>
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </AdaptiveCard>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="xl:col-span-5 xl:sticky xl:top-4 xl:self-start">
                    <AdaptiveCard
                        header={{
                            content: (
                                <div>
                                    <h4 className="text-base font-semibold heading-text">
                                        Scanner
                                    </h4>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Hardware wedge, keyboard, or device camera
                                    </p>
                                </div>
                            ),
                        }}
                    >
                        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/40">
                            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Barcode value
                            </label>
                            <Input
                                ref={inputRef as any}
                                className="h-14 border-gray-200 bg-white font-mono text-lg tracking-wide dark:border-gray-600 dark:bg-gray-900"
                                placeholder="Scan or type…"
                                value={barcode}
                                onChange={(e: any) =>
                                    onBarcodeChange(e.target.value)
                                }
                                onKeyDown={(e: any) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        void onScan()
                                    }
                                }}
                                autoComplete="off"
                                autoFocus
                            />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Button
                                block
                                size="lg"
                                variant="solid"
                                className="h-12"
                                icon={<HiOutlineQrcode className="text-lg" />}
                                loading={scanning}
                                onClick={() => void onScan()}
                            >
                                Lookup
                            </Button>
                            <Button
                                block
                                size="lg"
                                variant="default"
                                className="h-12"
                                icon={<HiOutlineCamera className="text-lg" />}
                                disabled={scanning}
                                onClick={() => setCameraOpen(true)}
                            >
                                Camera
                            </Button>
                        </div>

                        {onConfirm ? (
                            <Button
                                block
                                size="lg"
                                variant="solid"
                                className="mt-3 h-12"
                                loading={confirming}
                                onClick={onConfirm}
                            >
                                {confirmLabel}
                            </Button>
                        ) : null}
                    </AdaptiveCard>

                    {feedback ? (
                        <Alert
                            showIcon
                            type={feedbackAlertType(feedback.type)}
                            title={
                                feedback.title ??
                                (feedback.type === 'success'
                                    ? 'Success'
                                    : feedback.type === 'danger'
                                      ? 'Attention'
                                      : 'Info')
                            }
                            className="mt-4"
                        >
                            {feedback.message}
                        </Alert>
                    ) : null}
                </div>

                <div className="flex flex-col gap-6 xl:col-span-7">{children}</div>
            </div>

            <CameraBarcodeScanner
                isOpen={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onDetected={handleCameraDetected}
            />
        </PageContainer>
    )
}

export default MobileScanShell
