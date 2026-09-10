import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
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
            bodyLimit: 15 * 1024 * 1024,
        }),
    )

    app.setGlobalPrefix('api/v1')

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    )

    // Attach Socket.IO to Fastify's underlying Node HTTP server.
    app.useWebSocketAdapter(new IoAdapter(app.getHttpServer()))

    app.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })

    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })

    console.log(`AGCTEK ERP API running on http://localhost:${port}`)
}

bootstrap()
