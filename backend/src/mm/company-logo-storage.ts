import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_ROOT = resolve(
    process.env.COMPANY_LOGO_UPLOAD_DIR ??
        join(process.cwd(), '..', 'public', 'uploads', 'companies'),
)

export const COMPANY_LOGO_URL_PREFIX = '/uploads/companies/'
export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024

const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/

function detectImageExtension(buffer: Buffer): string | null {
    if (buffer.length < 12) return null
    if (
        buffer
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
    ) {
        return 'png'
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        return 'jpg'
    if (
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'webp'
    }
    const header = buffer.toString('ascii', 0, 6)
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif'
    return null
}

/** Validates image bytes and stores under `public/uploads/companies`. */
export function saveCompanyLogo(buffer: Buffer): string {
    if (!buffer.length) throw new Error('Logo file is empty')
    if (buffer.length > COMPANY_LOGO_MAX_BYTES)
        throw new Error('Logo exceeds the 5 MB limit')
    const ext = detectImageExtension(buffer)
    if (!ext) throw new Error('Only PNG, JPG, WEBP or GIF images are allowed')
    mkdirSync(UPLOAD_ROOT, { recursive: true })
    const fileName = `${randomUUID()}.${ext}`
    writeFileSync(join(UPLOAD_ROOT, fileName), buffer)
    return COMPANY_LOGO_URL_PREFIX + fileName
}

export function deleteCompanyLogoByUrl(
    logoUrl: string | null | undefined,
): void {
    if (!logoUrl?.startsWith(COMPANY_LOGO_URL_PREFIX)) return
    const fileName = logoUrl.slice(COMPANY_LOGO_URL_PREFIX.length)
    if (!FILE_NAME_PATTERN.test(fileName)) return
    const absolutePath = join(UPLOAD_ROOT, fileName)
    if (existsSync(absolutePath)) unlinkSync(absolutePath)
}
