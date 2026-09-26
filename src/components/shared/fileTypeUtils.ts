export type FileKind =
    | 'image'
    | 'pdf'
    | 'zip'
    | 'word'
    | 'excel'
    | 'csv'
    | 'text'
    | 'generic'

const EXT_KIND: Record<string, FileKind> = {
    pdf: 'pdf',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    zip: 'zip',
    doc: 'word',
    docx: 'word',
    xls: 'excel',
    xlsx: 'excel',
    csv: 'csv',
    txt: 'text',
}

export function getFileExtension(fileName?: string | null): string {
    if (!fileName) return ''
    const parts = fileName.toLowerCase().split('.')
    return parts.length > 1 ? (parts.pop() ?? '') : ''
}

export function inferMimeType(
    fileName?: string | null,
    mimeType?: string | null,
): string {
    const mime = mimeType?.trim().toLowerCase() ?? ''
    if (mime && mime !== 'application/octet-stream') {
        return mime
    }

    const ext = getFileExtension(fileName)
    switch (ext) {
        case 'pdf':
            return 'application/pdf'
        case 'png':
            return 'image/png'
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg'
        case 'gif':
            return 'image/gif'
        case 'webp':
            return 'image/webp'
        case 'doc':
            return 'application/msword'
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        case 'xls':
            return 'application/vnd.ms-excel'
        case 'xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        case 'csv':
            return 'text/csv'
        case 'txt':
            return 'text/plain'
        case 'zip':
            return 'application/zip'
        default:
            return mime || 'application/octet-stream'
    }
}

export function getFileKind(
    fileName?: string | null,
    mimeType?: string | null,
): FileKind {
    const mime = inferMimeType(fileName, mimeType)

    if (mime.startsWith('image/')) return 'image'
    if (mime === 'application/pdf') return 'pdf'
    if (mime === 'application/zip') return 'zip'
    if (
        mime.includes('word') ||
        mime === 'application/msword'
    ) {
        return 'word'
    }
    if (mime === 'text/csv') return 'csv'
    if (mime.includes('spreadsheetml') || mime.includes('excel')) {
        return 'excel'
    }
    if (mime.startsWith('text/')) return 'text'

    const extKind = EXT_KIND[getFileExtension(fileName)]
    return extKind ?? 'generic'
}

export function canPreviewFile(
    fileName?: string | null,
    mimeType?: string | null,
): boolean {
    const kind = getFileKind(fileName, mimeType)
    return (
        kind === 'image' ||
        kind === 'pdf' ||
        kind === 'text' ||
        kind === 'csv' ||
        kind === 'excel'
    )
}
