import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { RetailSessionService } from './retail-session.service'

const SECRET = 'test-secret-that-is-at-least-32-characters-long'

describe('RetailSessionService', () => {
    const original = process.env.RETAIL_AUTH_SECRET

    beforeEach(() => {
        process.env.RETAIL_AUTH_SECRET = SECRET
    })

    afterAll(() => {
        process.env.RETAIL_AUTH_SECRET = original
    })

    it('issues a token that verifies back to the client id', () => {
        const sessions = new RetailSessionService()
        const { token, expiresAt } = sessions.issue('client-1')
        expect(sessions.verify(token)).toBe('client-1')
        expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
        expect(sessions.clientIdFromAuthorization(`Bearer ${token}`)).toBe('client-1')
    })

    it('returns null when no bearer token is sent', () => {
        const sessions = new RetailSessionService()
        expect(sessions.clientIdFromAuthorization(undefined)).toBeNull()
        expect(sessions.clientIdFromAuthorization('Basic abc')).toBeNull()
    })

    it('rejects tampered, foreign and expired tokens', () => {
        const sessions = new RetailSessionService()
        const { token } = sessions.issue('client-1')
        const [header, , signature] = token.split('.')
        const forged = Buffer.from(
            JSON.stringify({ sub: 'client-2', aud: 'retail-client', exp: 9999999999 }),
        ).toString('base64url')
        expect(() => sessions.verify(`${header}.${forged}.${signature}`)).toThrow(
            UnauthorizedException,
        )

        process.env.RETAIL_AUTH_SECRET = `${SECRET}-other`
        const other = new RetailSessionService().issue('client-1').token
        process.env.RETAIL_AUTH_SECRET = SECRET
        expect(() => sessions.verify(other)).toThrow(UnauthorizedException)

        jest.useFakeTimers().setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
        try {
            expect(() => sessions.verify(token)).toThrow(UnauthorizedException)
        } finally {
            jest.useRealTimers()
        }
    })

    describe('tracking links', () => {
        const originalTtl = process.env.PUBLIC_TRACKING_LINK_TTL_DAYS
        afterEach(() => {
            if (originalTtl === undefined) delete process.env.PUBLIC_TRACKING_LINK_TTL_DAYS
            else process.env.PUBLIC_TRACKING_LINK_TTL_DAYS = originalTtl
        })

        it('issues a link that verifies back to the order id (30-day default)', () => {
            delete process.env.PUBLIC_TRACKING_LINK_TTL_DAYS
            const sessions = new RetailSessionService()
            const { token, expiresAt } = sessions.issueTrackingLink('so-1')
            expect(sessions.verifyTrackingLink(token)).toBe('so-1')
            const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
            expect(days).toBeGreaterThan(29.9)
            expect(days).toBeLessThanOrEqual(30)
        })

        it('never accepts a tracking link as a sign-in, or a session as a link', () => {
            const sessions = new RetailSessionService()
            const link = sessions.issueTrackingLink('so-1').token
            const session = sessions.issue('client-1').token
            expect(() => sessions.verify(link)).toThrow(UnauthorizedException)
            expect(() => sessions.clientIdFromAuthorization(`Bearer ${link}`)).toThrow(
                UnauthorizedException,
            )
            expect(() => sessions.verifyTrackingLink(session)).toThrow(UnauthorizedException)
        })

        it('rejects tampered and expired links', () => {
            process.env.PUBLIC_TRACKING_LINK_TTL_DAYS = '1'
            const sessions = new RetailSessionService()
            const { token } = sessions.issueTrackingLink('so-1')
            const [header, , signature] = token.split('.')
            const forged = Buffer.from(
                JSON.stringify({ sub: 'so-2', aud: 'order-tracking', exp: 9999999999 }),
            ).toString('base64url')
            expect(() => sessions.verifyTrackingLink(`${header}.${forged}.${signature}`)).toThrow(
                'This tracking link is invalid or has expired.',
            )

            jest.useFakeTimers().setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
            try {
                expect(() => sessions.verifyTrackingLink(token)).toThrow(UnauthorizedException)
            } finally {
                jest.useRealTimers()
            }
        })
    })

    it('refuses to sign with a missing or short secret', () => {
        process.env.RETAIL_AUTH_SECRET = 'short'
        expect(() => new RetailSessionService().issue('client-1')).toThrow(
            InternalServerErrorException,
        )
    })
})
