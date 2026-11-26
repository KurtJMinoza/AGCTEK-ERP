import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import PDFDocumentImport from 'pdfkit'
import { createDocumentStorage } from '../common/document-storage'

/**
 * Company logo for quotation PDFs (Documents › PDF templates). When a profile has one, it is drawn
 * in the letterhead instead of the company name; address and TIN stay below it.
 */
export const QUOTATION_PDF_LOGO_MAX_BYTES = 1024 * 1024

export type QuotationPdfLogoType = 'image/png' | 'image/jpeg'

const PDFDocument = PDFDocumentImport as unknown as new (
    options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument
const storage = createDocumentStorage('sd', 'pdf-logos')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function logoType(bytes: Buffer): QuotationPdfLogoType | null {
    if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    return null
}

/** Pixel size from the PNG header or the JPEG start-of-frame marker; null when not found. */
export function quotationPdfLogoSize(bytes: Buffer): { width: number; height: number } | null {
    const type = logoType(bytes)
    if (type === 'image/png' && bytes.length >= 24) {
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    }
    if (type === 'image/jpeg') {
        let offset = 2
        while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
            const marker = bytes[offset + 1]
            const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
            if (isFrame) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
            offset += 2 + bytes.readUInt16BE(offset + 2)
        }
    }
    return null
}

/** Validates an uploaded logo: a PNG or JPEG within 1 MB that PDFKit can draw. Returns its type. */
export function assertQuotationPdfLogo(bytes: Buffer): QuotationPdfLogoType {
    if (bytes.length === 0) throw new BadRequestException('The logo file is empty')
    if (bytes.length > QUOTATION_PDF_LOGO_MAX_BYTES) {
        throw new PayloadTooLargeException('Logos are limited to 1 MB')
    }
    const type = logoType(bytes)
    if (!type) throw new BadRequestException('The logo must be a PNG or JPEG image')
    const size = quotationPdfLogoSize(bytes)
    if (!size || size.width < 1 || size.height < 1) {
        throw new BadRequestException('The logo image could not be read; export it again')
    }
    try {
        const probe = new PDFDocument({ size: 'A4' })
        probe.image(bytes, 0, 0, { fit: [10, 10] })
        probe.end()
    } catch {
        throw new BadRequestException('The logo image could not be read; export it again')
    }
    return type
}

export function saveQuotationPdfLogo(profileKey: string, fileName: string, bytes: Buffer): string {
    const storageKey = storage.buildKey('profile', profileKey, fileName)
    storage.save(storageKey, bytes)
    return storageKey
}

export function readQuotationPdfLogo(storageKey: string | null | undefined): Buffer | null {
    return storageKey ? storage.readBuffer(storageKey) : null
}

export function deleteQuotationPdfLogo(storageKey: string | null | undefined): void {
    storage.remove(storageKey)
}
