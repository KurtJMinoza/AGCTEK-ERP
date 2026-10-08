import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'
import { maintenanceException } from '../system-settings/maintenance-mode.guard'
import { roleAuthority, USER_ROLES } from './auth.constants'

const WITH_ROLE_NAME = { roleRef: { select: { name: true } } } as const

type SignUpInput = {
    email: string
    userName: string
    firstName?: string
    lastName?: string
    jobPosition?: string
    password: string
}

type SignInInput = {
    userName: string
    password: string
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SystemSettingsService,
    ) {}

    private toPublicUser(user: {
        id: string
        email: string
        userName: string
        firstName?: string | null
        lastName?: string | null
        jobPosition?: string | null
        bio?: string | null
        role: string
        roleRef?: { name: string } | null
        avatar: string
    }) {
        const role = user.role

        return {
            id: user.id,
            email: user.email,
            userName: user.userName,
            firstName: user.firstName ?? '',
            lastName: user.lastName ?? '',
            jobPosition: user.jobPosition ?? '',
            bio: user.bio ?? '',
            avatar: user.avatar,
            role,
            roleName: user.roleRef?.name ?? '',
            authority: roleAuthority(role),
        }
    }

    async signUp(input: SignUpInput) {
        const email = input.email.trim().toLowerCase()
        const userName = input.userName.trim()
        const password = input.password

        if (!(await this.settings.getBoolean(SETTING_KEYS.ALLOW_USER_SIGNUP))) {
            throw new ForbiddenException(
                'Sign-up is disabled. Ask a Super Admin to create your account.',
            )
        }
        if (await this.settings.isMaintenanceModeEnabled()) {
            throw maintenanceException()
        }

        const role = await this.signUpRole()

        if (!email || !userName || !password) {
            throw new BadRequestException('Email, username, and password are required.')
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
                firstName: input.firstName?.trim() ?? '',
                lastName: input.lastName?.trim() ?? '',
                jobPosition: input.jobPosition?.trim() ?? '',
                passwordHash,
                role,
            },
            include: WITH_ROLE_NAME,
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
            include: WITH_ROLE_NAME,
        })

        if (!user) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        const valid = await bcrypt.compare(password, user.passwordHash)

        if (!valid) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        if (!user.isActive) {
            throw new UnauthorizedException('This account has been deactivated.')
        }

        return this.toPublicUser(user)
    }

    async getProfile(userName: string) {
        const user = await this.prisma.user.findUnique({
            where: { userName: userName.trim() },
            include: WITH_ROLE_NAME,
        })

        if (!user) {
            throw new UnauthorizedException('User not found.')
        }

        return this.toPublicUser(user)
    }

    async updateProfile(input: {
        userName: string
        email?: string
        newUserName?: string
        firstName?: string
        lastName?: string
        jobPosition?: string
        bio?: string
        avatar?: string
    }) {
        const currentUserName = input.userName.trim()
        const user = await this.prisma.user.findUnique({
            where: { userName: currentUserName },
        })

        if (!user) {
            throw new UnauthorizedException('User not found.')
        }

        const nextEmail = input.email?.trim().toLowerCase()
        const nextUserName = input.newUserName?.trim()

        if (nextEmail && nextEmail !== user.email) {
            const emailTaken = await this.prisma.user.findUnique({
                where: { email: nextEmail },
            })

            if (emailTaken) {
                throw new ConflictException(
                    'An account with this email already exists.',
                )
            }
        }

        if (nextUserName && nextUserName !== user.userName) {
            const userNameTaken = await this.prisma.user.findUnique({
                where: { userName: nextUserName },
            })

            if (userNameTaken) {
                throw new ConflictException(
                    'An account with this username already exists.',
                )
            }
        }

        const updated = await this.prisma.user.update({
            where: { id: user.id },
            data: {
                ...(nextEmail ? { email: nextEmail } : {}),
                ...(nextUserName ? { userName: nextUserName } : {}),
                ...(input.firstName !== undefined
                    ? { firstName: input.firstName.trim() }
                    : {}),
                ...(input.lastName !== undefined
                    ? { lastName: input.lastName.trim() }
                    : {}),
                ...(input.jobPosition !== undefined
                    ? { jobPosition: input.jobPosition.trim() }
                    : {}),
                ...(input.bio !== undefined ? { bio: input.bio.trim() } : {}),
                ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
            },
            include: WITH_ROLE_NAME,
        })

        return {
            status: 'success',
            message: 'Profile updated successfully.',
            user: this.toPublicUser(updated),
        }
    }

    async changePassword(input: {
        userName: string
        currentPassword: string
        newPassword: string
    }) {
        const userName = input.userName.trim()
        const user = await this.prisma.user.findUnique({
            where: { userName },
        })

        if (!user) {
            throw new UnauthorizedException('User not found.')
        }

        const valid = await bcrypt.compare(
            input.currentPassword,
            user.passwordHash,
        )

        if (!valid) {
            throw new BadRequestException('Current password is incorrect.')
        }

        if (!input.newPassword || input.newPassword.length < 6) {
            throw new BadRequestException(
                'New password must be at least 6 characters.',
            )
        }

        const passwordHash = await bcrypt.hash(input.newPassword, 10)

        await this.prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
        })

        return {
            status: 'success',
            message: 'Password updated successfully.',
        }
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
                role: USER_ROLES.SUPER_ADMIN,
            },
        })
    }

    /** Configured default role, falling back to employee if it was removed or is not assignable. */
    private async signUpRole(): Promise<string> {
        const configured = await this.settings.getString(SETTING_KEYS.DEFAULT_USER_ROLE)
        if (configured === USER_ROLES.SUPER_ADMIN) return USER_ROLES.EMPLOYEE
        const role = await this.prisma.role.findUnique({
            where: { code: configured },
            select: { isActive: true },
        })
        return role?.isActive ? configured : USER_ROLES.EMPLOYEE
    }
}
