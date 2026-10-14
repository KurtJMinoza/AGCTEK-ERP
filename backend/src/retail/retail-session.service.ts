import {
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const AUDIENCE = 'retail-client'
/** Shareable order-tracking links; a different audience so they never act as a sign-in. */
const TRACKING_LINK_AUDIENCE = 'order-tracking'
const DEFAULT_TRACKING_LINK_TTL_DAYS = 30
const MIN_SECRET_LENGTH = 32
const JWT_HEADER = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
).toString('base64url')

export type RetailSession = { token: string; expiresAt: string }
export type TrackingLink = { token: string; expiresAt: string }

const sessionExpired = () =>
    new UnauthorizedException('Your session has expired. Please sign in again.')

const trackingLinkInvalid = () =>
    new UnauthorizedException('This tracking link is invalid or has expired.')

/**
 * Stateless shopper sessions: HS256 JWTs signed with `RETAIL_AUTH_SECRET`.
 * Separate from ERP staff auth — a shopper token never grants ERP access.
 * Also signs order-tracking links (audience-scoped, order id only).
 */
@Injectable()
export class RetailSessionService {
    private secret: Buffer | null = null

    issue(clientId: string): RetailSession {
        return this.issueToken(clientId, AUDIENCE, SESSION_TTL_SECONDS)
    }

    /** Returns the client id of a valid, unexpired token; throws 401 otherwise. */
    verify(token: string): string {
        return this.verifyToken(token, AUDIENCE, sessionExpired)
    }

    /** `Authorization: Bearer <token>` → client id; null when no bearer token is sent. */
    clientIdFromAuthorization(authorization: string | undefined): string | null {
        const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? '')
        return match ? this.verify(match[1]) : null
    }

    /** Read-only tracking link for one order (TTL: PUBLIC_TRACKING_LINK_TTL_DAYS, default 30). */
    issueTrackingLink(orderId: string): TrackingLink {
        const days = Number(process.env.PUBLIC_TRACKING_LINK_TTL_DAYS)
        const ttlDays =
            Number.isFinite(days) && days > 0
                ? Math.min(days, 365)
                : DEFAULT_TRACKING_LINK_TTL_DAYS
        return this.issueToken(
            orderId,
            TRACKING_LINK_AUDIENCE,
            Math.round(ttlDays * 24 * 60 * 60),
        )
    }

    /** Order id of a valid tracking link; throws 401 otherwise. */
    verifyTrackingLink(token: string): string {
        return this.verifyToken(token, TRACKING_LINK_AUDIENCE, trackingLinkInvalid)
    }

    private issueToken(sub: string, aud: string, ttlSeconds: number) {
        const iat = Math.floor(Date.now() / 1000)
        const exp = iat + ttlSeconds
        const payload = Buffer.from(
            JSON.stringify({ sub, aud, iat, exp }),
        ).toString('base64url')
        const unsigned = `${JWT_HEADER}.${payload}`
        return {
            token: `${unsigned}.${this.sign(unsigned)}`,
            expiresAt: new Date(exp * 1000).toISOString(),
        }
    }

    private verifyToken(
        token: string,
        aud: string,
        invalid: () => UnauthorizedException,
    ): string {
        const [header, payload, signature, ...rest] = token.split('.')
        if (!header || !payload || !signature || rest.length > 0) {
            throw invalid()
        }
        const expected = Buffer.from(this.sign(`${header}.${payload}`))
        const actual = Buffer.from(signature)
        if (
            expected.length !== actual.length ||
            !timingSafeEqual(expected, actual)
        ) {
            throw invalid()
        }

        let claims: { sub?: unknown; aud?: unknown; exp?: unknown }
        try {
            claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
        } catch {
            throw invalid()
        }
        if (
            claims.aud !== aud ||
            typeof claims.sub !== 'string' ||
            !claims.sub ||
            typeof claims.exp !== 'number' ||
            claims.exp * 1000 <= Date.now()
        ) {
            throw invalid()
        }
        return claims.sub
    }

    private sign(unsigned: string) {
        return createHmac('sha256', this.key())
            .update(unsigned)
            .digest('base64url')
    }

    private key(): Buffer {
        if (this.secret) return this.secret
        if (!process.env.RETAIL_AUTH_SECRET) {
            try {
                process.loadEnvFile()
            } catch {
                // No .env file; rely on the process environment.
            }
        }
        const secret = process.env.RETAIL_AUTH_SECRET?.trim() ?? ''
        if (secret.length < MIN_SECRET_LENGTH) {
            throw new InternalServerErrorException(
                'Shop sign-in is not configured (RETAIL_AUTH_SECRET).',
            )
        }
        this.secret = Buffer.from(secret)
        return this.secret
    }
}
