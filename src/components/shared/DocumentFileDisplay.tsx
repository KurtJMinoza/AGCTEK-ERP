'use client'

import type { ReactNode } from 'react'
import {
    VscFile,
    VscFilePdf,
    VscFileZip,
    VscFileMedia,
    VscFileSubmodule,
} from 'react-icons/vsc'
import {
    PiFileCsvDuotone,
    PiFileDocDuotone,
    PiFileXlsDuotone,
} from 'react-icons/pi'
import classNames from '@/utils/classNames'
import {
    getFileKind,
    type FileKind,
} from '@/components/shared/fileTypeUtils'
import type { CommonProps } from '@/@types/common'

type DocumentFileDisplayProps = CommonProps & {
    fileName: string
    mimeType?: string | null
    sizeBytes?: number | null
    previewSrc?: string | null
    compact?: boolean
    /** Table/list row — no card chrome */
    inline?: boolean
}

const BYTE = 1000

function FileIconShell({ children }: { children: ReactNode }) {
    return <span className="text-3xl heading-text">{children}</span>
}

function renderKindIcon(kind: FileKind, previewSrc?: string | null) {
    if (kind === 'image' && previewSrc) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                className="upload-file-image max-h-12 max-w-12 rounded object-cover"
                src={previewSrc}
                alt=""
            />
        )
    }

    switch (kind) {
        case 'image':
            return (
                <FileIconShell>
                    <VscFileMedia />
                </FileIconShell>
            )
        case 'pdf':
            return (
                <FileIconShell>
                    <VscFilePdf />
                </FileIconShell>
            )
        case 'zip':
            return (
                <FileIconShell>
                    <VscFileZip />
                </FileIconShell>
            )
        case 'word':
            return (
                <FileIconShell>
                    <PiFileDocDuotone />
                </FileIconShell>
            )
        case 'excel':
            return (
                <FileIconShell>
                    <PiFileXlsDuotone />
                </FileIconShell>
            )
        case 'csv':
            return (
                <FileIconShell>
                    <PiFileCsvDuotone />
                </FileIconShell>
            )
        case 'text':
            return (
                <FileIconShell>
                    <VscFileSubmodule />
                </FileIconShell>
            )
        default:
            return (
                <FileIconShell>
                    <VscFile />
                </FileIconShell>
            )
    }
}

const DocumentFileDisplay = ({
    fileName,
    mimeType,
    sizeBytes,
    previewSrc,
    compact = false,
    inline = false,
    className,
    children,
}: DocumentFileDisplayProps) => {
    const kind = getFileKind(fileName, mimeType)

    return (
        <div
            className={classNames(
                inline ? 'flex min-w-0 items-center' : 'upload-file',
                className,
            )}
        >
            <div className="flex min-w-0 items-center">
                <div
                    className={classNames(
                        'upload-file-thumbnail shrink-0',
                        compact && 'min-h-10 w-10',
                    )}
                >
                    {renderKindIcon(kind, previewSrc)}
                </div>
                <div className="upload-file-info min-w-0">
                    <h6
                        className="upload-file-name truncate text-sm font-bold"
                        title={fileName}
                    >
                        {fileName}
                    </h6>
                    {typeof sizeBytes === 'number' ? (
                        <span className="upload-file-size">
                            {Math.max(1, Math.round(sizeBytes / BYTE))} kb
                        </span>
                    ) : null}
                </div>
            </div>
            {children}
        </div>
    )
}

export default DocumentFileDisplay
