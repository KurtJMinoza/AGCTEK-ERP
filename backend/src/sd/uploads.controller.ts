import {
    Controller,
    Get,
    NotFoundException,
    Param,
    Res,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { createReadStream, existsSync, statSync } from 'fs'
import {
    uploadContentType,
    uploadFilePath,
    type UploadKind,
} from './product-image-storage'

/**
 * Serves the uploaded catalog pictures and videos.
 *
 * The web app serves `public/` from a snapshot taken when it started, so a
 * file uploaded afterwards would 404 until the app restarts. The API keeps
 * the files on disk and streams them here instead, so a picture uploaded in
 * the Product Catalog is visible immediately — in the shop, the POS and the
 * catalog itself.
 *
 * These files are public (the storefront is public), and the file name must
 * be a generated one, so no path can escape the upload folders.
 */
@Controller('uploads')
export class UploadsController {
    @Get('products/:file')
    product(@Param('file') file: string, @Res() res: FastifyReply) {
        return this.send(res, 'products', file)
    }

    @Get('deliveries/:file')
    delivery(@Param('file') file: string, @Res() res: FastifyReply) {
        return this.send(res, 'deliveries', file)
    }

    private send(
        res: FastifyReply,
        kind: UploadKind,
        file: string,
    ) {
        const absolutePath = uploadFilePath(kind, file)
        if (!absolutePath || !existsSync(absolutePath)) {
            throw new NotFoundException('File not found')
        }
        const stat = statSync(absolutePath)
        res.header('Content-Type', uploadContentType(file))
        res.header('Content-Length', stat.size)
        // The name is a UUID, so the file never changes: cache it hard.
        res.header('Cache-Control', 'public, max-age=31536000, immutable')
        return res.send(createReadStream(absolutePath))
    }
}
