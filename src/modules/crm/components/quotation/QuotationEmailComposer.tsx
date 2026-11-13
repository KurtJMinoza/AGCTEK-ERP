'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import classNames from 'classnames'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineBookmark,
    HiOutlineCheck,
    HiOutlineChevronDown,
    HiOutlineDownload,
    HiOutlineMail,
    HiOutlinePaperClip,
    HiOutlineTemplate,
    HiOutlineTrash,
    HiOutlineX,
} from 'react-icons/hi'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import {
    createQuotationEmailTemplate,
    downloadSentQuotationPdf,
    getQuotationEmailPreview,
    sendQuotationEmail,
    type Quotation,
    type QuotationEmailPreview,
} from '@/modules/sd/services/quotationService'

type QuotationEmailComposerProps = {
    /** Open while non-null. */
    quotation: Quotation | null
    /** Resend the stored PDF of this revision instead of emailing it for the first time. */
    isResend?: boolean
    onClose: () => void
    /** Called after the email was accepted by the mail server so the page can reload. */
    onSent: () => void
}

/** Explains a non-delivery the server reported without throwing (mail disabled / no transport). */
function notDeliveredMessage(result: {
    skippedReason?: string
    error?: string
}) {
    switch (result.skippedReason) {
        case 'MAIL_ENABLED=false':
            return 'Email is disabled in this environment, so nothing was delivered.'
        case 'no_transporter_configured':
            return 'No mail server is configured, so nothing was delivered.'
        default:
            return result.error ?? 'The email was not delivered.'
    }
}

const iconButtonClass =
    'relative z-30 rounded-full p-1.5 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700'

const COMPOSE_MIN_WIDTH = 560
const COMPOSE_MIN_HEIGHT = 440
const COMPOSE_DEFAULT_WIDTH = 720
const COMPOSE_DEFAULT_HEIGHT = 640

/** Keeps at least this much of the window on screen so it can always be grabbed again. */
const COMPOSE_VISIBLE_EDGE = 80

const MAX_WIDTH = () => Math.min(window.innerWidth * 0.92, 960)
const MAX_HEIGHT = () => Math.min(window.innerHeight * 0.9, 800)

type ComposerFrame = { x: number; y: number; width: number; height: number }
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_CURSORS: Record<ResizeDirection, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
}

const RESIZE_HANDLES: Array<{ direction: ResizeDirection; className: string }> =
    [
        { direction: 'n', className: 'inset-x-3 top-0 h-2 cursor-ns-resize' },
        {
            direction: 's',
            className: 'inset-x-3 bottom-0 h-2 cursor-ns-resize',
        },
        { direction: 'w', className: 'inset-y-3 left-0 w-2 cursor-ew-resize' },
        { direction: 'e', className: 'inset-y-3 right-0 w-2 cursor-ew-resize' },
        {
            direction: 'nw',
            className: 'left-0 top-0 h-4 w-4 cursor-nwse-resize',
        },
        {
            direction: 'ne',
            className: 'right-0 top-0 h-4 w-4 cursor-nesw-resize',
        },
        {
            direction: 'sw',
            className: 'left-0 bottom-0 h-4 w-4 cursor-nesw-resize',
        },
        {
            direction: 'se',
            className: 'right-0 bottom-0 h-4 w-4 cursor-nwse-resize',
        },
    ]

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

function clampComposerFrame(frame: ComposerFrame): ComposerFrame {
    const maxWidth = MAX_WIDTH()
    const maxHeight = MAX_HEIGHT()
    const width = clamp(
        frame.width,
        Math.min(COMPOSE_MIN_WIDTH, maxWidth),
        maxWidth,
    )
    const height = clamp(
        frame.height,
        Math.min(COMPOSE_MIN_HEIGHT, maxHeight),
        maxHeight,
    )
    return {
        width,
        height,
        x: clamp(
            frame.x,
            -width + COMPOSE_VISIBLE_EDGE,
            window.innerWidth - COMPOSE_VISIBLE_EDGE,
        ),
        y: clamp(frame.y, 0, Math.max(0, window.innerHeight - 40)),
    }
}

function defaultComposerFrame(): ComposerFrame {
    const width = Math.min(COMPOSE_DEFAULT_WIDTH, MAX_WIDTH())
    const height = Math.min(COMPOSE_DEFAULT_HEIGHT, MAX_HEIGHT())
    return clampComposerFrame({
        x: Math.round((window.innerWidth - width) / 2),
        y: Math.round((window.innerHeight - height) / 2),
        width,
        height,
    })
}

/** West/North resize keeps the opposite edge pinned while the size changes. */
function resizeComposerFrame(
    start: ComposerFrame,
    direction: ResizeDirection,
    dx: number,
    dy: number,
): ComposerFrame {
    let { x, y, width, height } = start
    if (direction.includes('e'))
        width = clamp(start.width + dx, COMPOSE_MIN_WIDTH, MAX_WIDTH())
    if (direction.includes('s'))
        height = clamp(start.height + dy, COMPOSE_MIN_HEIGHT, MAX_HEIGHT())
    if (direction.includes('w')) {
        width = clamp(start.width - dx, COMPOSE_MIN_WIDTH, MAX_WIDTH())
        x = start.x + (start.width - width)
    }
    if (direction.includes('n')) {
        height = clamp(start.height - dy, COMPOSE_MIN_HEIGHT, MAX_HEIGHT())
        y = start.y + (start.height - height)
    }
    return clampComposerFrame({ x, y, width, height })
}

/**
 * Compose window for a quotation the customer has already been offered. The quoting PDF is always
 * attached; only the cover letter is editable. The template list and "save as template" keep the
 * copy reusable, and nothing here changes quotation lines or status.
 */
export default function QuotationEmailComposer({
    quotation,
    isResend = false,
    onClose,
    onSent,
}: QuotationEmailComposerProps) {
    const quotationId = quotation?.id
    const [preview, setPreview] = useState<QuotationEmailPreview | null>(null)
    const [templateKey, setTemplateKey] = useState('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
    const [saveOpen, setSaveOpen] = useState(false)
    const [templateName, setTemplateName] = useState('')
    const [savingTemplate, setSavingTemplate] = useState(false)
    const [frame, setFrame] = useState<ComposerFrame>(() =>
        typeof window === 'undefined'
            ? {
                  x: 0,
                  y: 0,
                  width: COMPOSE_DEFAULT_WIDTH,
                  height: COMPOSE_DEFAULT_HEIGHT,
              }
            : defaultComposerFrame(),
    )
    const [active, setActive] = useState<{
        mode: 'move' | 'resize'
        direction?: ResizeDirection
    } | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const dragCleanupRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        if (!quotationId) return
        let cancelled = false
        setPreview(null)
        setError(null)
        setLoading(true)
        // The backend picks the resend template when none is requested.
        getQuotationEmailPreview(
            quotationId,
            isResend ? 'quotation_resent' : undefined,
        )
            .then((loaded) => {
                if (cancelled) return
                setPreview(loaded)
                setTemplateKey(loaded.templateKey)
                setSubject(loaded.subject)
                setBody(loaded.bodyText)
            })
            .catch((err) => {
                if (cancelled) return
                setError(
                    getApiErrorMessage(
                        err,
                        'Could not load the quotation email',
                    ),
                )
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [quotationId, isResend])

    useEffect(() => {
        setTemplateMenuOpen(false)
        setSaveOpen(false)
        setTemplateName('')
        setFrame(
            typeof window === 'undefined'
                ? {
                      x: 0,
                      y: 0,
                      width: COMPOSE_DEFAULT_WIDTH,
                      height: COMPOSE_DEFAULT_HEIGHT,
                  }
                : defaultComposerFrame(),
        )
    }, [quotationId])

    // A drag interrupted by close/unmount must not leave window listeners behind.
    useEffect(() => () => dragCleanupRef.current?.(), [])

    useEffect(() => {
        const reClamp = () => setFrame((current) => clampComposerFrame(current))
        window.addEventListener('resize', reClamp)
        return () => window.removeEventListener('resize', reClamp)
    }, [])

    // While dragging/resizing, the cursor and text selection must follow the gesture everywhere.
    useEffect(() => {
        if (!active) return
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor =
            active.mode === 'move'
                ? 'grabbing'
                : RESIZE_CURSORS[active.direction as ResizeDirection]
        document.body.style.userSelect = 'none'
        return () => {
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
        }
    }, [active])

    useEffect(() => {
        if (!templateMenuOpen) return
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setTemplateMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', closeOnOutsideClick)
        return () =>
            document.removeEventListener('mousedown', closeOnOutsideClick)
    }, [templateMenuOpen])

    const beginInteraction = (
        event: ReactPointerEvent<HTMLElement>,
        mode: 'move' | 'resize',
        direction?: ResizeDirection,
    ) => {
        if (event.button !== 0 || !event.isPrimary) return
        // Dragging/resizing is pointer polish; narrow screens stay a centered, fitted modal.
        if (window.innerWidth < 640) return
        if (mode === 'move' && (event.target as HTMLElement).closest('button'))
            return

        const start = { clientX: event.clientX, clientY: event.clientY, frame }
        event.preventDefault()
        // Keep receiving moves when the pointer leaves the header/handle.
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setActive({ mode, direction })

        const move = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - start.clientX
            const dy = moveEvent.clientY - start.clientY
            setFrame(
                mode === 'move'
                    ? clampComposerFrame({
                          ...start.frame,
                          x: start.frame.x + dx,
                          y: start.frame.y + dy,
                      })
                    : resizeComposerFrame(
                          start.frame,
                          direction as ResizeDirection,
                          dx,
                          dy,
                      ),
            )
        }
        const finish = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
            dragCleanupRef.current = null
            setActive(null)
        }
        dragCleanupRef.current = finish
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
    }

    const chooseTemplate = async (key: string) => {
        if (!key || !quotationId) return
        setTemplateKey(key)
        setError(null)
        try {
            const loaded = await getQuotationEmailPreview(quotationId, key)
            setPreview(loaded)
            setSubject(loaded.subject)
            setBody(loaded.bodyText)
        } catch (err) {
            setError(
                getApiErrorMessage(err, 'Could not load the selected template'),
            )
        }
    }

    const send = async () => {
        if (!quotation) return
        setSending(true)
        setError(null)
        try {
            const result = await sendQuotationEmail(quotation.id, {
                templateKey,
                subject: subject.trim(),
                bodyText: body,
                isResend,
            })
            if (!result.sent) {
                setError(notDeliveredMessage(result))
                return
            }
            toast.push(
                <Notification
                    type="success"
                    title="Quotation emailed"
                    closable
                    duration={4000}
                >
                    Sent to {result.to} with {result.attachmentFilename}.
                </Notification>,
                { placement: 'top-end' },
            )
            onSent()
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not email the quotation'))
        } finally {
            setSending(false)
        }
    }

    const canSaveTemplate = Boolean(
        preview &&
            templateName.trim() &&
            subject.trim() &&
            body.trim() &&
            !savingTemplate,
    )

    const saveAsTemplate = async () => {
        if (!quotation || !canSaveTemplate) return
        setSavingTemplate(true)
        setError(null)
        try {
            const created = await createQuotationEmailTemplate(quotation.id, {
                name: templateName.trim(),
                subject: subject.trim(),
                bodyText: body,
            })
            toast.push(
                <Notification
                    type="success"
                    title="Template saved"
                    closable
                    duration={4000}
                >
                    {created.name} is now available in the template list.
                </Notification>,
                { placement: 'top-end' },
            )
            setPreview((current) =>
                current
                    ? {
                          ...current,
                          templates: [
                              ...current.templates.filter(
                                  (item) => item.key !== created.key,
                              ),
                              created,
                          ],
                      }
                    : current,
            )
            setTemplateKey(created.key)
            setSaveOpen(false)
            setTemplateName('')
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not save the template'))
        } finally {
            setSavingTemplate(false)
        }
    }

    const downloadSent = async () => {
        if (!quotation) return
        setDownloading(true)
        try {
            const { blob, filename } = await downloadSentQuotationPdf(
                quotation.id,
            )
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download =
                filename ??
                `${quotation.quotationNumber}_rev${quotation.revision}.pdf`
            link.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.push(
                <Notification
                    type="danger"
                    title="Download failed"
                    closable
                    duration={4000}
                >
                    {getApiErrorMessage(
                        err,
                        'Could not download the sent quotation PDF',
                    )}
                </Notification>,
                { placement: 'top-end' },
            )
        } finally {
            setDownloading(false)
        }
    }

    const templates = preview?.templates ?? []
    const selectedTemplate = templates.find(
        (template) => template.key === templateKey,
    )
    const canSend = Boolean(preview?.to) && !loading && !sending

    return (
        <Dialog
            isOpen={Boolean(quotation)}
            onClose={onClose}
            closable={false}
            shouldCloseOnOverlayClick={false}
            shouldCloseOnEsc={!sending}
            width={720}
            contentClassName="!h-full !overflow-hidden !rounded-xl !p-0"
            overlayClassName="!bg-black/20 !backdrop-blur-none"
            style={{
                content: {
                    position: 'fixed',
                    left: frame.x,
                    top: frame.y,
                    width: frame.width,
                    height: frame.height,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    margin: 0,
                },
                overlay: { padding: 0 },
            }}
        >
            <div className="relative flex h-full min-h-0 w-full flex-col bg-white dark:bg-gray-900">
                {RESIZE_HANDLES.map(({ direction, className }) => (
                    <div
                        key={direction}
                        role="separator"
                        tabIndex={-1}
                        aria-label={`Resize ${direction}`}
                        onPointerDown={(event) =>
                            beginInteraction(event, 'resize', direction)
                        }
                        className={classNames(
                            'absolute z-40 touch-none',
                            className,
                        )}
                    />
                ))}
                <header
                    onPointerDown={(event) => beginInteraction(event, 'move')}
                    className={classNames(
                        'flex shrink-0 select-none items-center justify-between gap-3 bg-gray-100 px-4 py-2.5 touch-none dark:bg-gray-800',
                        active?.mode === 'move'
                            ? 'cursor-grabbing'
                            : 'sm:cursor-grab',
                    )}
                    title="Drag to move"
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <HiOutlineMail className="shrink-0 text-base text-gray-500" />
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {isResend
                                ? 'Resend quotation email'
                                : 'New message'}
                        </span>
                        {preview ? (
                            <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                                {preview.quotationNumber} · rev{' '}
                                {preview.revision}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            title="Close"
                            aria-label="Close"
                            className={iconButtonClass}
                            onClick={onClose}
                            disabled={sending}
                        >
                            <HiOutlineX className="text-lg" />
                        </button>
                    </div>
                </header>

                {error ? (
                    <div className="shrink-0 px-4 pt-3">
                        <Alert showIcon type="danger">
                            {error}
                        </Alert>
                    </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <div className="shrink-0 px-4">
                        <div className="flex items-center gap-2 border-b border-gray-200 py-2.5 dark:border-gray-700">
                            <span className="text-sm text-gray-500">To</span>
                            {preview?.to ? (
                                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                    <span className="shrink-0 font-medium">
                                        {preview.customerName}
                                    </span>
                                    <span className="truncate text-gray-500 dark:text-gray-400">
                                        &lt;{preview.to}&gt;
                                    </span>
                                </span>
                            ) : (
                                <span className="text-sm text-gray-400">
                                    {loading
                                        ? 'Loading recipient…'
                                        : 'Customer has no email address'}
                                </span>
                            )}
                        </div>

                        <input
                            aria-label="Subject"
                            placeholder="Subject"
                            maxLength={300}
                            value={subject}
                            disabled={!preview || loading}
                            onChange={(event) => setSubject(event.target.value)}
                            className="w-full border-b border-gray-200 bg-transparent py-3 text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 disabled:opacity-60 dark:border-gray-700 dark:text-gray-100"
                        />
                    </div>

                    {!preview?.to && preview ? (
                        <div className="shrink-0 px-4 pt-3">
                            <Alert showIcon type="warning">
                                Add an email address to this customer in
                                Customer Master before emailing the quotation.
                            </Alert>
                        </div>
                    ) : null}

                    <textarea
                        aria-label="Message"
                        placeholder={
                            loading
                                ? 'Loading the email…'
                                : 'Write your message…'
                        }
                        maxLength={20_000}
                        value={body}
                        disabled={!preview || loading}
                        onChange={(event) => setBody(event.target.value)}
                        className="min-h-32 w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-gray-200"
                    />

                    {preview ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
                            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                <HiOutlinePaperClip className="shrink-0 text-sm text-gray-400" />
                                <span className="truncate">
                                    {preview.attachmentFilename}
                                </span>
                                <span className="shrink-0 text-[10px] font-medium tracking-wide text-gray-400">
                                    PDF
                                </span>
                            </span>
                            <span className="text-xs text-gray-400">
                                Attached automatically
                            </span>
                        </div>
                    ) : null}
                </div>

                {saveOpen ? (
                    <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            Save as template
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            This quotation&apos;s values become placeholders, so
                            the copy works for other customers too.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Input
                                size="sm"
                                autoFocus
                                maxLength={120}
                                className="min-w-[12rem] flex-1"
                                placeholder="Template name, e.g. Pricing follow-up"
                                value={templateName}
                                onChange={(event) =>
                                    setTemplateName(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        void saveAsTemplate()
                                    }
                                    if (event.key === 'Escape') {
                                        event.stopPropagation()
                                        setSaveOpen(false)
                                    }
                                }}
                            />
                            <Button
                                size="sm"
                                variant="solid"
                                loading={savingTemplate}
                                disabled={!canSaveTemplate}
                                onClick={() => void saveAsTemplate()}
                            >
                                Save
                            </Button>
                            <Button
                                size="sm"
                                disabled={savingTemplate}
                                onClick={() => setSaveOpen(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : null}

                <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
                    <Button
                        variant="solid"
                        size="sm"
                        className="!rounded-full !px-5"
                        loading={sending}
                        disabled={!canSend}
                        onClick={() => void send()}
                    >
                        {isResend ? 'Resend' : 'Send'}
                    </Button>

                    <div className="relative" ref={menuRef}>
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineTemplate />}
                            disabled={!preview || loading}
                            onClick={() =>
                                setTemplateMenuOpen((value) => !value)
                            }
                        >
                            <span className="max-w-[10rem] truncate">
                                {selectedTemplate?.name ?? 'Templates'}
                            </span>
                            <HiOutlineChevronDown className="ml-1 text-xs opacity-60" />
                        </Button>
                        {templateMenuOpen && preview ? (
                            <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                    Templates
                                </div>
                                <ul className="max-h-64 overflow-y-auto py-1">
                                    {templates.map((template) => (
                                        <li key={template.key}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTemplateMenuOpen(false)
                                                    void chooseTemplate(
                                                        template.key,
                                                    )
                                                }}
                                                className={classNames(
                                                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-700/60',
                                                    template.key === templateKey
                                                        ? 'font-medium text-primary'
                                                        : 'text-gray-700 dark:text-gray-200',
                                                )}
                                            >
                                                <span className="flex-1 truncate">
                                                    {template.name}
                                                </span>
                                                {template.key ===
                                                templateKey ? (
                                                    <HiOutlineCheck className="shrink-0 text-sm" />
                                                ) : template.isDefault ? (
                                                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                                                        Default
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>

                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineBookmark />}
                        disabled={!preview || loading || savingTemplate}
                        onClick={() => setSaveOpen(true)}
                    >
                        Save as template
                    </Button>

                    {preview?.hasStoredPdf ? (
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineDownload />}
                            loading={downloading}
                            onClick={() => void downloadSent()}
                        >
                            Sent PDF
                        </Button>
                    ) : null}

                    <span className="ml-auto hidden text-xs text-gray-400 sm:inline">
                        {preview?.lastEmailedAt
                            ? `Last emailed ${new Date(preview.lastEmailedAt).toLocaleString()}`
                            : 'Not emailed yet'}
                    </span>

                    <button
                        type="button"
                        title="Discard"
                        aria-label="Discard"
                        className={iconButtonClass}
                        onClick={onClose}
                        disabled={sending}
                    >
                        <HiOutlineTrash className="text-base" />
                    </button>
                </footer>
            </div>
        </Dialog>
    )
}
