import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'

@Injectable()
export class AppService {
    constructor(private readonly prisma: PrismaService) {}

    async getHealth() {
        let database: 'connected' | 'disconnected' = 'disconnected'

        try {
            await this.prisma.$queryRaw`SELECT 1`
            database = 'connected'
        } catch {
            database = 'disconnected'
        }

        return {
            status: 'ok',
            name: 'AGCTEK ERP API',
            stack: 'NestJS + TypeScript + Fastify + Prisma',
            database,
        }
    }
}
