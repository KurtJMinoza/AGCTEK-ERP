import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import {
    FastifyAdapter,
    NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            bodyLimit: 5 * 1024 * 1024,
        }),
    )

    app.useWebSocketAdapter(new IoAdapter(app))

    app.enableCors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })

    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })

    console.log(`AGCTEK ERP API running on http://localhost:${port}`)
}

bootstrap()
