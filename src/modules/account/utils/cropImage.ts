export const CROP_VIEWPORT_SIZE = 280
export const CROP_OUTPUT_SIZE = 512

export type CropTransform = {
    x: number
    y: number
    zoom: number
}

export const getBaseScale = (image: HTMLImageElement) => {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    return Math.max(CROP_VIEWPORT_SIZE / width, CROP_VIEWPORT_SIZE / height)
}

export const clampCropTransform = (
    image: HTMLImageElement,
    transform: CropTransform,
): CropTransform => {
    const baseScale = getBaseScale(image)
    const scale = baseScale * transform.zoom
    const imageWidth = image.naturalWidth || image.width
    const imageHeight = image.naturalHeight || image.height
    const displayedWidth = imageWidth * scale
    const displayedHeight = imageHeight * scale

    const maxX = Math.max(0, (displayedWidth - CROP_VIEWPORT_SIZE) / 2)
    const maxY = Math.max(0, (displayedHeight - CROP_VIEWPORT_SIZE) / 2)

    return {
        zoom: transform.zoom,
        x: Math.min(maxX, Math.max(-maxX, transform.x)),
        y: Math.min(maxY, Math.max(-maxY, transform.y)),
    }
}

export const cropImageToDataUrl = (
    image: HTMLImageElement,
    transform: CropTransform,
    mimeType = 'image/jpeg',
    quality = 0.82,
) => {
    const baseScale = getBaseScale(image)
    const scale = baseScale * transform.zoom
    const imageWidth = image.naturalWidth || image.width
    const imageHeight = image.naturalHeight || image.height
    const viewportCanvas = document.createElement('canvas')

    viewportCanvas.width = CROP_VIEWPORT_SIZE
    viewportCanvas.height = CROP_VIEWPORT_SIZE

    const viewportContext = viewportCanvas.getContext('2d')

    if (!viewportContext) {
        throw new Error('Unable to process image file.')
    }

    viewportContext.fillStyle = '#ffffff'
    viewportContext.fillRect(0, 0, CROP_VIEWPORT_SIZE, CROP_VIEWPORT_SIZE)
    viewportContext.save()
    viewportContext.translate(
        CROP_VIEWPORT_SIZE / 2 + transform.x,
        CROP_VIEWPORT_SIZE / 2 + transform.y,
    )
    viewportContext.scale(scale, scale)
    viewportContext.drawImage(
        image,
        -imageWidth / 2,
        -imageHeight / 2,
        imageWidth,
        imageHeight,
    )
    viewportContext.restore()

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = CROP_OUTPUT_SIZE
    outputCanvas.height = CROP_OUTPUT_SIZE

    const outputContext = outputCanvas.getContext('2d')

    if (!outputContext) {
        throw new Error('Unable to process image file.')
    }

    outputContext.drawImage(
        viewportCanvas,
        0,
        0,
        CROP_VIEWPORT_SIZE,
        CROP_VIEWPORT_SIZE,
        0,
        0,
        CROP_OUTPUT_SIZE,
        CROP_OUTPUT_SIZE,
    )

    const dataUrl = outputCanvas.toDataURL(mimeType, quality)

    if (!dataUrl) {
        throw new Error('Unable to process image file.')
    }

    return dataUrl
}

export const loadImageFromFile = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = () => {
            if (typeof reader.result !== 'string') {
                reject(new Error('Unable to read image file.'))
                return
            }

            const image = new Image()

            image.onload = () => resolve(image)
            image.onerror = () =>
                reject(new Error('Unable to read image file.'))
            image.src = reader.result
        }

        reader.onerror = () => reject(new Error('Unable to read image file.'))
        reader.readAsDataURL(file)
    })

export const loadImageFromSrc = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()

        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Unable to read image file.'))
        image.src = src
    })
