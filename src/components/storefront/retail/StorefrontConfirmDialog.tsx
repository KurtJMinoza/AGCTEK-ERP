'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Dialog from '@/components/ui/Dialog'
import StorefrontLogo from '@/components/storefront/retail/StorefrontLogo'
import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'

type ConfirmTone = 'default' | 'caution' | 'danger'

type StorefrontConfirmDialogProps = {
    isOpen: boolean
    title: string
    children?: ReactNode
    confirmText?: string
    cancelText?: string
    tone?: ConfirmTone
    loading?: boolean
    onConfirm?: () => void
    onCancel?: () => void
}

export default function StorefrontConfirmDialog({
    isOpen,
    title,
    children,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    tone = 'default',
    loading = false,
    onConfirm,
    onCancel,
}: StorefrontConfirmDialogProps) {
    const confirmClass =
        tone === 'danger'
            ? 'bg-brand-ink text-brand-gold-soft hover:bg-brand-deep'
            : tone === 'caution'
              ? 'bg-brand-gold text-brand-deep hover:bg-brand-gold-soft'
              : 'bg-brand-deep text-brand-gold-soft hover:bg-brand-ink'

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onCancel}
            width={340}
            closable={false}
            contentClassName="overflow-hidden rounded-md border border-brand-gold/30 p-0 shadow-[0_20px_50px_rgba(10,42,32,0.28)]"
            overlayClassName="!bg-[#06281f]/55 backdrop-blur-sm"
        >
            <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="bg-brand-canvas"
            >
                <div className="border-b border-brand-gold/20 bg-brand-deep px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <StorefrontLogo size="sm" />
                        <span className="font-storefront-body text-[10px] font-medium uppercase tracking-[0.18em] text-brand-gold-soft/75">
                            {AWIC_BRAND.shortName}
                        </span>
                    </div>
                    <h2 className="mt-3 font-storefront-heading text-lg font-semibold tracking-tight text-brand-gold-soft">
                        {title}
                    </h2>
                </div>

                <div className="px-5 py-4">
                    {children ? (
                        <div className="font-storefront-body text-sm leading-relaxed text-brand-ink/65">
                            {children}
                        </div>
                    ) : null}

                    <div
                        className={classNames(
                            'flex items-center justify-end gap-2',
                            children ? 'mt-5' : 'mt-1',
                        )}
                    >
                        <button
                            type="button"
                            disabled={loading}
                            onClick={onCancel}
                            className="px-3.5 py-2 font-storefront-body text-sm font-medium text-brand-ink/45 transition-colors hover:text-brand-ink disabled:opacity-40"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={onConfirm}
                            className={classNames(
                                'rounded-sm px-4 py-2 font-storefront-body text-sm font-semibold transition-colors disabled:opacity-50',
                                confirmClass,
                            )}
                        >
                            {loading ? 'Please wait…' : confirmText}
                        </button>
                    </div>
                </div>
            </motion.div>
        </Dialog>
    )
}
