import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { RetailClientService } from '../retail-client.service'
import {
    AUTH_PROVIDER_EMAIL_OTP,
    AUTH_PROVIDER_GOOGLE,
    GENERIC_OTP_SENT_MESSAGE,
    SHOP_NO_ACCOUNT_USE_GOOGLE,
    OTP_MAX_ATTEMPTS,
    OTP_MAX_REQUESTS_PER_EMAIL,
    OTP_MAX_REQUESTS_PER_IP,
    OTP_REQUEST_WINDOW_MS,
    OTP_RESEND_DELAY_MS,
    OTP_TTL_MS,
} from './shop-auth.constants'
import { assertGmailAddress, GmailOnlyError } from './gmail.util'
import { generateOtpCode, hashOtpCode, verifyOtpHash } from './shop-otp.util'
import { ShopMailService } from './shop-mail.service'
import { ShopGoogleAuthService } from './shop-google-auth.service'

@Injectable()
export class ShopAuthService {
    private readonly log = new Logger(ShopAuthService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly retailClients: RetailClientService,
        private readonly mail: ShopMailService,
        private readonly google: ShopGoogleAuthService,
    ) {}

    async requestEmailCode(
        emailRaw: string,
        requestIp?: string,
        requestUserAgent?: string,
    ) {
        const email = this.requireGmail(emailRaw)
        const account = await this.prisma.retailClient.findUnique({
            where: { email },
            select: { id: true, status: true },
        })
        if (!account) {
            throw new BadRequestException(SHOP_NO_ACCOUNT_USE_GOOGLE)
        }
        if (account.status === 'DISABLED') {
            throw new UnauthorizedException(
                'This customer account is unavailable. Contact support.',
            )
        }

        const since = new Date(Date.now() - OTP_REQUEST_WINDOW_MS)

        const [emailCount, ipCount, latest] = await Promise.all([
            this.prisma.retailEmailOtp.count({
                where: { emailNormalized: email, createdAt: { gte: since } },
            }),
            requestIp
                ? this.prisma.retailEmailOtp.count({
                      where: { requestIp, createdAt: { gte: since } },
                  })
                : Promise.resolve(0),
            this.prisma.retailEmailOtp.findFirst({
                where: { emailNormalized: email },
                orderBy: { createdAt: 'desc' },
            }),
        ])

        if (emailCount >= OTP_MAX_REQUESTS_PER_EMAIL) {
            throw new HttpException(
                'Too many attempts. Request a new code.',
                HttpStatus.TOO_MANY_REQUESTS,
            )
        }
        if (ipCount >= OTP_MAX_REQUESTS_PER_IP) {
            throw new HttpException(
                'Too many attempts. Request a new code.',
                HttpStatus.TOO_MANY_REQUESTS,
            )
        }
        if (
            latest &&
            !latest.usedAt &&
            Date.now() - latest.createdAt.getTime() < OTP_RESEND_DELAY_MS
        ) {
            throw new HttpException(
                'Please wait before requesting another code.',
                HttpStatus.TOO_MANY_REQUESTS,
            )
        }

        await this.prisma.retailEmailOtp.updateMany({
            where: {
                emailNormalized: email,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            data: { usedAt: new Date() },
        })

        const code =
            process.env.SHOP_OTP_FIXED_CODE?.trim() &&
            process.env.NODE_ENV === 'test'
                ? process.env.SHOP_OTP_FIXED_CODE.trim()
                : generateOtpCode()
        const expiresAt = new Date(Date.now() + OTP_TTL_MS)
        const record = await this.prisma.retailEmailOtp.create({
            data: {
                emailNormalized: email,
                codeHash: hashOtpCode('pending', email, code),
                expiresAt,
                requestIp: requestIp?.slice(0, 64) ?? null,
                requestUserAgent: requestUserAgent?.slice(0, 512) ?? null,
            },
        })
        await this.prisma.retailEmailOtp.update({
            where: { id: record.id },
            data: {
                codeHash: hashOtpCode(record.id, email, code),
            },
        })

        try {
            await this.mail.sendOtpEmail(email, code)
        } catch (error) {
            await this.prisma.retailEmailOtp.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            })
            throw error
        }

        this.log.log(`Shop OTP sent for ${email}`)
        return { message: GENERIC_OTP_SENT_MESSAGE }
    }

    async verifyEmailCode(
        emailRaw: string,
        code: string,
        firstName?: string,
    ) {
        const email = this.requireGmail(emailRaw)
        const otp = await this.prisma.retailEmailOtp.findFirst({
            where: {
                emailNormalized: email,
                usedAt: null,
            },
            orderBy: { createdAt: 'desc' },
        })

        if (!otp) {
            throw new BadRequestException('The verification code is incorrect.')
        }
        if (otp.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException(
                'This verification code has expired.',
            )
        }
        if (otp.attemptCount >= OTP_MAX_ATTEMPTS) {
            throw new HttpException(
                'Too many attempts. Request a new code.',
                HttpStatus.TOO_MANY_REQUESTS,
            )
        }

        const valid = verifyOtpHash(otp.codeHash, otp.id, email, code.trim())
        if (!valid) {
            await this.prisma.retailEmailOtp.update({
                where: { id: otp.id },
                data: { attemptCount: { increment: 1 } },
            })
            throw new BadRequestException('The verification code is incorrect.')
        }

        const consumed = await this.prisma.retailEmailOtp.updateMany({
            where: { id: otp.id, usedAt: null },
            data: { usedAt: new Date() },
        })
        if (consumed.count !== 1) {
            throw new BadRequestException('The verification code is incorrect.')
        }

        const result = await this.retailClients.upsertFromVerifiedGmail({
            email,
            provider: AUTH_PROVIDER_EMAIL_OTP,
            firstName: firstName?.trim() || null,
            allowAccountCreation: false,
        })

        const session = await this.retailClients.buildAuthSession(
            result.clientId,
            { needsProfile: result.needsProfile },
        )
        return {
            ...session,
            message: 'Your Gmail has been verified.',
            redirectTo: '/shop',
        }
    }

    async signInWithGoogle(credential: string) {
        const profile = await this.google.verifyIdToken(credential)
        const result = await this.retailClients.upsertFromVerifiedGmail({
            email: profile.email,
            provider: AUTH_PROVIDER_GOOGLE,
            providerUserId: profile.sub,
            firstName: profile.givenName ?? profile.name?.split(/\s+/)[0],
            lastName: profile.familyName ?? null,
            allowAccountCreation: true,
        })
        const session = await this.retailClients.buildAuthSession(
            result.clientId,
            { needsProfile: result.needsProfile },
        )
        return { ...session, redirectTo: '/shop' }
    }

    private requireGmail(raw: string): string {
        try {
            return assertGmailAddress(raw)
        } catch (error) {
            if (error instanceof GmailOnlyError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }
    }
}
