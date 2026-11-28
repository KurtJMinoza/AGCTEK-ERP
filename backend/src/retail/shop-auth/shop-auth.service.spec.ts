import { ShopAuthService } from './shop-auth.service'
import { assertGmailAddress, GmailOnlyError } from './gmail.util'
import {
    hashOtpCode,
    mismatchedOtpDigits,
    verifyOtpHash,
} from './shop-otp.util'

describe('Gmail shop auth utilities', () => {
    beforeAll(() => {
        process.env.EMAIL_OTP_SECRET = 'test-email-otp-secret-min-16'
    })

    it('accepts @gmail.com and normalizes case', () => {
        expect(assertGmailAddress('  User@Gmail.COM ')).toBe('user@gmail.com')
    })

    it('rejects non-Gmail domains', () => {
        expect(() => assertGmailAddress('user@yahoo.com')).toThrow(
            GmailOnlyError,
        )
    })

    it('stores only a hash of the OTP', () => {
        const hash = hashOtpCode('otp-1', 'user@gmail.com', '123456')
        expect(hash).not.toContain('123456')
        expect(verifyOtpHash(hash, 'otp-1', 'user@gmail.com', '123456')).toBe(
            true,
        )
        expect(verifyOtpHash(hash, 'otp-1', 'user@gmail.com', '000000')).toBe(
            false,
        )
    })

    it('reports only the mismatched digit positions', () => {
        const hash = hashOtpCode('otp-1', 'user@gmail.com', '123456')
        expect(
            mismatchedOtpDigits(hash, 'otp-1', 'user@gmail.com', '123456'),
        ).toEqual([])
        expect(
            mismatchedOtpDigits(hash, 'otp-1', 'user@gmail.com', '123400'),
        ).toEqual([4, 5])
        expect(
            mismatchedOtpDigits(hash, 'otp-1', 'user@gmail.com', '923456'),
        ).toEqual([0])
        expect(hash).not.toContain('123456')
    })
})

describe('ShopAuthService requestEmailCode', () => {
    it('rejects OTP when no shop account exists', async () => {
        const prisma = {
            retailClient: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
        }
        const service = new ShopAuthService(
            prisma as never,
            { upsertFromVerifiedGmail: jest.fn() } as never,
            { sendOtpEmail: jest.fn() } as never,
            {} as never,
        )
        await expect(
            service.requestEmailCode('newuser@gmail.com'),
        ).rejects.toMatchObject({
            message: expect.stringMatching(/Continue with Google/i),
        })
    })

    it('sends OTP when a shop account already exists', async () => {
        const prisma = {
            retailClient: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'c1',
                    status: 'ACTIVE',
                }),
            },
            retailEmailOtp: {
                count: jest.fn().mockResolvedValue(0),
                findFirst: jest.fn().mockResolvedValue(null),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
                update: jest.fn().mockResolvedValue({}),
            },
        }
        const mail = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) }
        const service = new ShopAuthService(
            prisma as never,
            { upsertFromVerifiedGmail: jest.fn() } as never,
            mail as never,
            {} as never,
        )
        const result = await service.requestEmailCode('shopper@gmail.com')
        expect(result.message).toMatch(/verification code has been sent/i)
        expect(mail.sendOtpEmail).toHaveBeenCalled()
    })
})

describe('ShopAuthService verifyEmailCode', () => {
    it('returns mismatched digit indexes on a wrong code', async () => {
        const codeHash = hashOtpCode('otp-1', 'shopper@gmail.com', '123456')
        const prisma = {
            retailEmailOtp: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'otp-1',
                    codeHash,
                    expiresAt: new Date(Date.now() + 60_000),
                    attemptCount: 0,
                }),
                update: jest.fn().mockResolvedValue({}),
            },
        }
        const service = new ShopAuthService(
            prisma as never,
            {} as never,
            {} as never,
            {} as never,
        )
        await expect(
            service.verifyEmailCode('shopper@gmail.com', '123400'),
        ).rejects.toMatchObject({
            response: {
                message: 'The verification code is incorrect.',
                mismatchedDigits: [4, 5],
            },
        })
        expect(prisma.retailEmailOtp.update).toHaveBeenCalled()
    })
})
