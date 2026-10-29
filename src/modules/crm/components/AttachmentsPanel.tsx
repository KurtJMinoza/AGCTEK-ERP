'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Upload from '@/components/ui/Upload'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import {
    apiDownloadAttachment,
    apiListAttachments,
    apiRemoveAttachment,
    apiUploadAttachment,
} from '../services/crmApi'
import { formatDate, formatUserName } from '../utils/format'
import type { AttachmentParent, CrmAttachment } from '../types'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt'

const fileSizeLabel = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function toBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
        reader.readAsDataURL(file)
    })
}

type AttachmentsPanelProps = {
    parent: AttachmentParent
    /** Upload rights (create on the record); the server re-checks. */
    canUpload: boolean
    /** Remove rights (delete on the record); the server re-checks. */
    canRemove: boolean
    /** E.g. a closed ticket: list and download only. */
    readOnly?: boolean
    /** After an upload or removal (the server audits both on the record). */
    onChanged?: () => void
}

type Result = { key: string; rows: CrmAttachment[]; error: string | null }

/** Supporting documents with versions; uploads and removals are audited by the server. */
export default function AttachmentsPanel({ parent, canUpload, canRemove, readOnly, onChanged }: AttachmentsPanelProps) {
    const [refresh, setRefresh] = useState(0)
    const requestKey = `${parent.kind}:${parent.id}#${refresh}`
    const [result, setResult] = useState<Result | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [removing, setRemoving] = useState<CrmAttachment | null>(null)

    useEffect(() => {
        let active = true
        apiListAttachments(parent)
            .then((rows) => active && setResult({ key: requestKey, rows, error: null }))
            .catch(
                (err) =>
                    active &&
                    setResult({ key: requestKey, rows: [], error: getApiErrorMessage(err, 'Unable to load attachments') }),
            )
        return () => {
            active = false
        }
        // `parent` is identified by the request key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey])

    const changed = () => {
        setRefresh((n) => n + 1)
        onChanged?.()
    }

    const upload = async (file: File) => {
        setError(null)
        if (file.size > MAX_BYTES) {
            setError(`${file.name} is larger than 10 MB`)
            return
        }
        setBusy(true)
        try {
            await apiUploadAttachment(parent, {
                fileName: file.name,
                mimeType: file.type || undefined,
                contentBase64: await toBase64(file),
            })
            changed()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Upload failed'))
        } finally {
            setBusy(false)
        }
    }

    const download = async (row: CrmAttachment) => {
        setError(null)
        try {
            const blob = await apiDownloadAttachment(parent, row.id)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = row.fileName
            link.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Download failed'))
        }
    }

    const remove = async () => {
        if (!removing) return
        setBusy(true)
        setError(null)
        try {
            await apiRemoveAttachment(parent, removing.id)
            setRemoving(null)
            changed()
        } catch (err) {
            setRemoving(null)
            setError(getApiErrorMessage(err, 'Could not remove the attachment'))
        } finally {
            setBusy(false)
        }
    }

    const loaded = result?.key === requestKey ? result : null
    const rows = loaded?.rows ?? []

    return (
        <div className="flex flex-col gap-3 text-sm">
            {error || loaded?.error ? (
                <Alert showIcon type="danger">
                    {error ?? loaded?.error}
                </Alert>
            ) : null}
            {!loaded ? (
                <p className="text-gray-500">Loading attachments…</p>
            ) : rows.length === 0 ? (
                <p className="text-gray-500">No attachments yet.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
                    {rows.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                            <span className="font-medium">{row.fileName}</span>
                            {row.version > 1 ? <span className="text-xs text-gray-500">v{row.version}</span> : null}
                            <span className="text-xs text-gray-500">
                                {fileSizeLabel(row.fileSize)} · {formatUserName(row.uploader, 'Unknown user')} ·{' '}
                                {formatDate(row.createdAt)}
                            </span>
                            <span className="ml-auto flex gap-2">
                                <Button size="xs" onClick={() => void download(row)}>
                                    Download
                                </Button>
                                {canRemove && !readOnly ? (
                                    <Button size="xs" onClick={() => setRemoving(row)}>
                                        Remove
                                    </Button>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {canUpload && !readOnly ? (
                <Upload
                    showList={false}
                    uploadLimit={1}
                    accept={ACCEPTED}
                    disabled={busy}
                    onChange={(files) => {
                        const file = files[files.length - 1]
                        if (file) void upload(file)
                    }}
                >
                    <Button size="sm" loading={busy}>
                        Attach file
                    </Button>
                </Upload>
            ) : null}
            <p className="text-xs text-gray-500">
                PDF, Office, CSV, text or image files up to 10 MB. Uploading the same file name again adds a
                new version; removed files stay on record.
            </p>
            <ConfirmDialog
                isOpen={Boolean(removing)}
                type="warning"
                title={`Remove ${removing?.fileName ?? 'attachment'}?`}
                confirmText="Remove"
                confirmButtonProps={{ loading: busy }}
                onClose={() => setRemoving(null)}
                onCancel={() => setRemoving(null)}
                onConfirm={() => void remove()}
            >
                It disappears from this list but stays on record with who removed it and when.
            </ConfirmDialog>
        </div>
    )
}
