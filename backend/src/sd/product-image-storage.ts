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
export const PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const PRODUCT_VIDEO_MAX = 4

/** Public URL prefix served by Next.js from `public/`. */
export const PRODUCT_IMAGE_URL_PREFIX = '/uploads/products/'

const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif|mp4|webm|mov)$/
const VIDEO_URL_PATTERN = /^\/uploads\/products\/[0-9a-f-]{36}\.(mp4|webm|mov)$/

export const isProductVideoUrl = (url: unknown): url is string =>
    typeof url === 'string' && VIDEO_URL_PATTERN.test(url)

/** Detects the image type from file content; the client-sent name and MIME type are not trusted. */
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

/** Validates and saves an image (creating the directory if needed); returns its public URL. */
export function saveProductImage(buffer: Buffer): string {
    if (!buffer.length) throw new Error('Image file is empty')
    if (buffer.length > PRODUCT_IMAGE_MAX_BYTES)
        throw new Error('Image exceeds the 5 MB limit')
    const ext = detectImageExtension(buffer)
    if (!ext) throw new Error('Only PNG, JPG, WEBP or GIF images are allowed')
    return writeUpload(buffer, ext)
}

function detectVideoExtension(buffer: Buffer): string | null {
    if (buffer.length < 16) return null
    if (buffer.toString('ascii', 4, 8) === 'ftyp') {
        return buffer.toString('ascii', 8, 12) === 'qt  ' ? 'mov' : 'mp4'
    }
    if (
        buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
        buffer.subarray(0, 64).includes('webm')
    ) {
        return 'webm'
    }
    return null
}

/** Validates and saves a product video; returns its public URL. */
export function saveProductVideo(buffer: Buffer): string {
    if (!buffer.length) throw new Error('Video file is empty')
    if (buffer.length > PRODUCT_VIDEO_MAX_BYTES)
        throw new Error('Video exceeds the 50 MB limit')
    const ext = detectVideoExtension(buffer)
    if (!ext) throw new Error('Only MP4, WEBM or MOV videos are allowed')
    return writeUpload(buffer, ext)
}

function writeUpload(buffer: Buffer, ext: string): string {
    mkdirSync(UPLOAD_ROOT, { recursive: true })
    const fileName = `${randomUUID()}.${ext}`
    writeFileSync(join(UPLOAD_ROOT, fileName), buffer)
    return PRODUCT_IMAGE_URL_PREFIX + fileName
}

/** Deletes an uploaded image or video by URL; ignores external or seeded paths. */
export function deleteProductImageByUrl(
    imageUrl: string | null | undefined,
): void {
    if (!imageUrl?.startsWith(PRODUCT_IMAGE_URL_PREFIX)) return
    const fileName = imageUrl.slice(PRODUCT_IMAGE_URL_PREFIX.length)
    if (!FILE_NAME_PATTERN.test(fileName)) return
    const absolutePath = join(UPLOAD_ROOT, fileName)
    if (existsSync(absolutePath)) unlinkSync(absolutePath)
}

/** Proof-of-delivery photos live in their own `public/uploads/deliveries` folder. */
const DELIVERY_UPLOAD_ROOT = resolve(
    process.env.DELIVERY_UPLOAD_DIR ??
        join(process.cwd(), '..', 'public', 'uploads', 'deliveries'),
)
export const DELIVERY_IMAGE_URL_PREFIX = '/uploads/deliveries/'
export const DELIVERY_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Saves a POD image buffer and returns its public URL (`/uploads/deliveries/…`). */
export function saveDeliveryProofImage(buffer: Buffer): string {
    if (!buffer.length) throw new Error('Proof-of-delivery image is empty')
    if (buffer.length > DELIVERY_IMAGE_MAX_BYTES)
        throw new Error('Proof-of-delivery image exceeds the 5 MB limit')
    mkdirSync(DELIVERY_UPLOAD_ROOT, { recursive: true })
    const fileName = `${randomUUID()}.jpg`
    writeFileSync(join(DELIVERY_UPLOAD_ROOT, fileName), buffer)
    return DELIVERY_IMAGE_URL_PREFIX + fileName
}
