import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common'
import { OAuth2Client, TokenPayload } from 'google-auth-library'
import { assertGmailAddress, GMAIL_ONLY_MESSAGE } from './gmail.util'

@Injectable()
export class ShopGoogleAuthService {
    private client: OAuth2Client | null = null

    async verifyIdToken(credential: string): Promise<{
        sub: string
        email: string
        emailVerified: boolean
        givenName?: string
        familyName?: string
        name?: string
    }> {
        const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
        if (!clientId) {
            throw new BadRequestException(
                'Google sign-in is not configured on this server.',
            )
        }
        const client = this.oauth(clientId)
        let ticket
        try {
            ticket = await client.verifyIdToken({
                idToken: credential,
                audience: clientId,
            })
        } catch {
            throw new UnauthorizedException(
                'Google sign-in could not be verified.',
            )
        }
        const payload = ticket.getPayload() as TokenPayload | undefined
        if (!payload?.email || !payload.sub) {
            throw new UnauthorizedException(
                'Google sign-in could not be verified.',
            )
        }
        if (payload.email_verified !== true) {
            throw new UnauthorizedException(
                'Google sign-in could not be verified.',
            )
        }
        let email: string
        try {
            email = assertGmailAddress(payload.email)
        } catch {
            throw new BadRequestException(GMAIL_ONLY_MESSAGE)
        }
        return {
            sub: payload.sub,
            email,
            emailVerified: true,
            givenName: payload.given_name,
            familyName: payload.family_name,
            name: payload.name,
        }
    }

    private oauth(clientId: string) {
        if (!this.client) {
            this.client = new OAuth2Client(
                clientId,
                process.env.GOOGLE_CLIENT_SECRET?.trim(),
            )
        }
        return this.client
    }
}
