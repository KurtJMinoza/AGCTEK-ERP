import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
])

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const files: File[] = []

        // Extract all 'images' or 'file' entries
        for (const [key, value] of formData.entries()) {
            if (value instanceof File && (key === 'images' || key === 'image' || key === 'file' || key === 'files')) {
                files.push(value)
            }
        }

        if (files.length === 0) {
            return NextResponse.json(
                { error: 'No image files provided' },
                { status: 400 },
            )
        }

        const uploadDir = join(process.cwd(), 'public', 'uploads', 'reviews')
        await mkdir(uploadDir, { recursive: true })

        const uploadedUrls: string[] = []

        for (const file of files) {
            if (file.size > MAX_IMAGE_BYTES) {
                return NextResponse.json(
                    { error: `File '${file.name}' exceeds the 5MB size limit` },
                    { status: 400 },
                )
            }

            if (!ALLOWED_MIME_TYPES.has(file.type)) {
                return NextResponse.json(
                    { error: `File '${file.name}' has invalid image type (${file.type}). Allowed: JPG, PNG, WEBP, GIF` },
                    { status: 400 },
                )
            }

            const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
            const fileName = `${randomUUID()}.${ext}`
            const filePath = join(uploadDir, fileName)

            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            await writeFile(filePath, buffer)
            uploadedUrls.push(`/uploads/reviews/${fileName}`)
        }

        return NextResponse.json({
            urls: uploadedUrls,
            url: uploadedUrls[0],
            success: true,
        })
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to upload review image',
            },
            { status: 500 },
        )
    }
}
