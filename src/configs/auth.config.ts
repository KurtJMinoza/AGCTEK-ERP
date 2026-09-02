import type { NextAuthConfig } from 'next-auth'
import validateCredential from '../server/actions/user/validateCredential'
import Credentials from 'next-auth/providers/credentials'

import type { SignInCredential } from '@/@types/auth'

const SESSION_WITHOUT_REMEMBER_MS = 24 * 60 * 60 * 1000 // 1 day
const SESSION_WITH_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const isDataUrl = (value?: string | null) => Boolean(value?.startsWith('data:'))

export default {
    providers: [
        Credentials({
            credentials: {
                userName: { type: 'text' },
                password: { type: 'password' },
                rememberMe: { type: 'text' },
            },
            async authorize(credentials) {
                /** validate credentials from backend here */
                const user = await validateCredential(
                    credentials as SignInCredential,
                )

                if (!user) {
                    return null
                }

                return {
                    id: user.id,
                    name: user.userName,
                    email: user.email,
                    authority: user.authority,
                    rememberMe: credentials?.rememberMe === 'true',
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // Persist the authority to the token right after signin
            if (user) {
                token.authority = user.authority
                token.rememberMe = user.rememberMe

                const now = Date.now()
                const ttl =
                    (token.rememberMe
                        ? SESSION_WITH_REMEMBER_MS
                        : SESSION_WITHOUT_REMEMBER_MS) / 1000
                token.exp = Math.floor(now / 1000) + ttl
            }

            if (trigger === 'update' && session) {
                if (session.name !== undefined) {
                    token.name = session.name
                }

                if (session.email !== undefined) {
                    token.email = session.email
                }
            }

            if (isDataUrl(token.picture as string | undefined)) {
                delete token.picture
            }

            const expiresAt = (token.exp as number) * 1000

            // Enforce session expiry on every request
            if (expiresAt && Date.now() > expiresAt) {
                return null
            }

            return token
        },
        async session({ session, token }) {
            // Send properties to the client
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.sub,
                    /** Uncomment this if you want to enable role based access */
                    // authority: token.authority,
                },
            }
        },
    },
    session: {
        strategy: 'jwt',
        // Default cookie lifespan; the JWT callback overrides it per user below.
        // Use 30 days so the session cookie stays valid while the token is checked on each request.
        maxAge: 30 * 24 * 60 * 60,
    },
} satisfies NextAuthConfig