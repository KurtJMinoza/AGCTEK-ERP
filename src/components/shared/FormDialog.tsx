'use client'

import type { ReactNode } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import classNames from '@/components/ui/utils/classNames'
import type { DialogProps } from '@/components/ui/Dialog'

export type FormDialogSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_WIDTH: Record<FormDialogSize, number> = {
    sm: 420,
    md: 520,
    lg: 680,
    xl: 800,
}

export interface FormDialogProps
    extends Omit<DialogProps, 'children' | 'width' | 'onClose'> {
    title: ReactNode
    description?: ReactNode
    /** Icon element passed to Avatar (e.g. `<HiOutlineCube />`) */
    icon?: ReactNode
    /** Overrides the default primary-tinted icon avatar colours */
    iconClassName?: string
    /** Preset widths — overridden by `width` when provided */
    size?: FormDialogSize
    width?: number
    children: ReactNode
    /** Sticky footer actions (Cancel / Save). Ignored when `onSubmit` is set. */
    footer?: ReactNode
    /** Optional row under the title (Steps, Tabs, alerts) */
    headerExtra?: ReactNode
    headerClassName?: string
    bodyClassName?: string
    footerClassName?: string
    onClose: () => void
    /** Convenience: builds Cancel + Confirm footer when `footer` is omitted. */
    onSubmit?: () => void | Promise<void>
    confirmText?: string
    confirmLoading?: boolean
}

/**
 * Responsive form/create/edit modal chrome built on ECME Dialog + Avatar.
 * Sticky header + scrollable body + sticky footer so content never overflows the viewport.
 */
const FormDialog = ({
    isOpen,
    onClose,
    title,
    description,
    icon,
    iconClassName,
    size = 'md',
    width,
    children,
    footer,
    headerExtra,
    headerClassName,
    bodyClassName,
    footerClassName,
    shouldCloseOnOverlayClick = false,
    contentClassName,
    onSubmit,
    confirmText = 'Confirm',
    confirmLoading,
    ...rest
}: FormDialogProps) => {
    const resolvedWidth = width ?? SIZE_WIDTH[size]
    const resolvedFooter =
        footer ??
        (onSubmit ? (
            <>
                <Button type="button" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="solid"
                    loading={confirmLoading}
                    onClick={() => {
                        void onSubmit()
                    }}
                >
                    {confirmText}
                </Button>
            </>
        ) : null)

    return (
        <Dialog
            isOpen={isOpen}
            width={resolvedWidth}
            onClose={onClose}
            onRequestClose={onClose}
            shouldCloseOnOverlayClick={shouldCloseOnOverlayClick}
            contentClassName={classNames(
                '!p-0 !overflow-hidden !flex !flex-col',
                contentClassName,
            )}
            {...rest}
        >
            <div className="flex min-h-0 max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden">
                <div
                    className={classNames(
                        'shrink-0 border-b border-gray-200 px-4 py-4 pr-14 sm:px-6 dark:border-gray-700',
                        headerClassName,
                    )}
                >
                    <div className="flex items-start gap-3">
                        {icon ? (
                            <Avatar
                                shape="circle"
                                size={40}
                                className={classNames(
                                    'shrink-0',
                                    iconClassName ??
                                        'bg-primary-subtle text-primary-deep',
                                )}
                                icon={icon}
                            />
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <h4 className="truncate text-base font-semibold heading-text sm:text-lg">
                                {title}
                            </h4>
                            {description ? (
                                <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                                    {description}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {headerExtra ? (
                        <div className="mt-4">{headerExtra}</div>
                    ) : null}
                </div>

                <div
                    className={classNames(
                        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
                        bodyClassName,
                    )}
                >
                    {children}
                </div>

                {resolvedFooter ? (
                    <div
                        className={classNames(
                            'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 dark:border-gray-700 dark:bg-gray-900/40',
                            footerClassName,
                        )}
                    >
                        {resolvedFooter}
                    </div>
                ) : null}
            </div>
        </Dialog>
    )
}

FormDialog.displayName = 'FormDialog'

export default FormDialog
