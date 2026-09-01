import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import {
    isUserRole,
    ROLE_AUTHORITY,
    USER_ROLES,
    type UserRole,
} from './auth.constants'

type SignUpInput = {
    email: string
    userName: string
    password: string
    role: string
}

type SignInInput = {
    userName: string
    password: string
}

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) {}

    private toPublicUser(user: {
        id: string
        email: string
        userName: string
        role: string
        avatar: string
    }) {
        const role = isUserRole(user.role) ? user.role : USER_ROLES.ADMIN

        return {
            id: user.id,
            email: user.email,
            userName: user.userName,
            avatar: user.avatar,
            role,
            authority: ROLE_AUTHORITY[role],
        }
    }

    async signUp(input: SignUpInput) {
        const email = input.email.trim().toLowerCase()
        const userName = input.userName.trim()
        const password = input.password
        const role = input.role

        if (!email || !userName || !password) {
            throw new BadRequestException('Email, username, and password are required.')
        }

        if (!isUserRole(role)) {
            throw new BadRequestException(
                'Role must be either Super Admin or Admin.',
            )
        }

        if (password.length < 6) {
            throw new BadRequestException(
                'Password must be at least 6 characters.',
            )
        }

        const existingEmail = await this.prisma.user.findUnique({
            where: { email },
        })

        if (existingEmail) {
            throw new ConflictException('An account with this email already exists.')
        }

        const existingUserName = await this.prisma.user.findUnique({
            where: { userName },
        })

        if (existingUserName) {
            throw new ConflictException(
                'An account with this username already exists.',
            )
        }

        const passwordHash = await bcrypt.hash(password, 10)

        const user = await this.prisma.user.create({
            data: {
                email,
                userName,
                passwordHash,
                role,
            },
        })

        return {
            status: 'success',
            message: 'Account created successfully.',
            user: this.toPublicUser(user),
        }
    }

    async signIn(input: SignInInput) {
        const userName = input.userName.trim()
        const password = input.password

        if (!userName || !password) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        const user = await this.prisma.user.findUnique({
            where: { userName },
        })

        if (!user) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        const valid = await bcrypt.compare(password, user.passwordHash)

        if (!valid) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        return this.toPublicUser(user)
    }

    async seedDemoUser() {
        const email = 'admin-01@ecme.com'
        const userName = 'admin'
        const passwordHash = await bcrypt.hash('123Qwe', 10)

        const existingByEmail = await this.prisma.user.findUnique({
            where: { email },
        })

        if (existingByEmail) {
            if (existingByEmail.userName !== userName) {
                await this.prisma.user.update({
                    where: { email },
                    data: { userName, passwordHash },
                })
            }

            return
        }

        const existingByUserName = await this.prisma.user.findUnique({
            where: { userName },
        })

        if (existingByUserName) {
            return
        }

        await this.prisma.user.create({
            data: {
                email,
                userName,
                passwordHash,
                role: USER_ROLES.SUPER_ADMIN as UserRole,
            },
        })
    }
}
