import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'

/**
 * Next.js `public/uploads/products` (backend runs from `backend/`). Override with
 * PRODUCT_UPLOAD_DIR when the API and web app do not share a filesystem layout.
 */
const UPLOAD_ROOT = resolve(
    process.env.PRODUCT_UPLOAD_DIR ??
        join(process.cwd(), '..', 'public', 'uploads', 'products'),
)

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Public URL prefix served by Next.js from `public/`. */
export const PRODUCT_IMAGE_URL_PREFIX = '/uploads/products/'

const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/

/** Detects the image type from file content; the client-sent name and MIME type are not trusted. */
function detectImageExtension(buffer: Buffer): string | null {
    if (buffer.length < 12) return null
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'png'
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'webp'
    }
    const header = buffer.toString('ascii', 0, 6)
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif'
    return null
}

/** Validates and saves an image (creating the directory if needed); returns its public URL. */
export function saveProductImage(buffer: Buffer): string {
    if (!buffer.length) throw new Error('Image file is empty')
    if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) throw new Error('Image exceeds the 5 MB limit')
    const ext = detectImageExtension(buffer)
    if (!ext) throw new Error('Only PNG, JPG, WEBP or GIF images are allowed')
    mkdirSync(UPLOAD_ROOT, { recursive: true })
    const fileName = `${randomUUID()}.${ext}`
    writeFileSync(join(UPLOAD_ROOT, fileName), buffer)
    return PRODUCT_IMAGE_URL_PREFIX + fileName
}

/** Deletes an uploaded image referenced by `imageUrl`; ignores external or seeded paths. */
export function deleteProductImageByUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl?.startsWith(PRODUCT_IMAGE_URL_PREFIX)) return
    const fileName = imageUrl.slice(PRODUCT_IMAGE_URL_PREFIX.length)
    if (!FILE_NAME_PATTERN.test(fileName)) return
    const absolutePath = join(UPLOAD_ROOT, fileName)
    if (existsSync(absolutePath)) unlinkSync(absolutePath)
}
