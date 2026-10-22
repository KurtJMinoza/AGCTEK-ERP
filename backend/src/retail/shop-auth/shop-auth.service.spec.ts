import { ShopAuthService } from './shop-auth.service'
import { assertGmailAddress, GmailOnlyError } from './gmail.util'
import { hashOtpCode, verifyOtpHash } from './shop-otp.util'

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
