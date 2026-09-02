const MAX_AVATAR_DIMENSION = 512
const AVATAR_JPEG_QUALITY = 0.82

const loadImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file)
        const image = new Image()

        image.onload = () => {
            URL.revokeObjectURL(objectUrl)
            resolve(image)
        }

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Unable to read image file.'))
        }

        image.src = objectUrl
    })

export const compressImageFile = async (file: File) => {
    const image = await loadImage(file)
    const scale = Math.min(
        1,
        MAX_AVATAR_DIMENSION / image.width,
        MAX_AVATAR_DIMENSION / image.height,
    )

    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
        throw new Error('Unable to process image file.')
    }

    context.drawImage(image, 0, 0, width, height)

    const outputType =
        file.type === 'image/png' || file.type === 'image/webp'
            ? file.type
            : 'image/jpeg'

    const dataUrl = canvas.toDataURL(outputType, AVATAR_JPEG_QUALITY)

    if (!dataUrl) {
        throw new Error('Unable to process image file.')
    }

    return dataUrl
}
