import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    createParamDecorator,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RetailSessionService } from './retail-session.service'

type RetailRequest = {
    headers: Record<string, string | string[] | undefined>
    retailClientId?: string
}

/** Requires a valid shopper session token for an account that still exists. */
@Injectable()
export class RetailClientAuthGuard implements CanActivate {
    constructor(
        private readonly sessions: RetailSessionService,
        private readonly prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RetailRequest>()
        const header = request.headers.authorization
        const clientId = this.sessions.clientIdFromAuthorization(
            Array.isArray(header) ? header[0] : header,
        )
        if (!clientId) {
            throw new UnauthorizedException('Please sign in to continue.')
        }
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId },
            select: { id: true },
        })
        if (!client) {
            throw new UnauthorizedException(
                'Your session has expired. Please sign in again.',
            )
        }
        request.retailClientId = client.id
        return true
    }
}

/** Client id resolved by `RetailClientAuthGuard`. */
export const CurrentRetailClientId = createParamDecorator(
    (_data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest<RetailRequest>().retailClientId,
)
