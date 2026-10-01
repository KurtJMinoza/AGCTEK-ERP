export const PRODUCT_IMAGE_PLACEHOLDER = '/img/others/product-placeholder.svg'

/** Hosts listed in `images.remotePatterns` (next.config.mjs). */
const OPTIMIZED_REMOTE_PREFIXES = ['https://images.unsplash.com/']

/** next/image only accepts site paths or absolute http(s) URLs. */
export const isRenderableImageSrc = (src: string) =>
    /^(\/(?!\/)|https?:\/\/)/.test(src)

export const productImageSrc = (src?: string | null) => {
    const value = src?.trim() ?? ''
    return isRenderableImageSrc(value) ? value : PRODUCT_IMAGE_PLACEHOLDER
}

/**
 * next/image throws for unlisted hosts unless unoptimized. Uploaded photos
 * (`/api/...`) are proxied to the API and already cached, so they skip the optimizer too.
 */
export const isUnoptimizedImage = (src: string) =>
    src.split('?')[0].endsWith('.svg') ||
    src.startsWith('/api/') ||
    !(
        (src.startsWith('/') && !src.startsWith('//')) ||
        OPTIMIZED_REMOTE_PREFIXES.some((prefix) => src.startsWith(prefix))
    )
