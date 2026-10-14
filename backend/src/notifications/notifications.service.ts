import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from './notifications.gateway'
import type { NotificationRecord } from './notification.types'

/** Staff views never include shopper (storefront) notifications. */
const STAFF_ONLY = { retailClientId: null }

@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationsGateway,
    ) {}

    private toRecord(notification: {
        id: string
        userId?: string | null
        title?: string
        message?: string
        isRead?: boolean
        target: string
        description: string
        type: number
        image: string
        location: string
        locationLabel: string
        status: string
        readed: boolean
        createdAt: Date
    }): NotificationRecord {
        const title = notification.title || notification.target
        const message = notification.message || notification.description
        const isRead = notification.isRead ?? notification.readed ?? false

        return {
            id: notification.id,
            userId: notification.userId ?? undefined,
            title,
            message,
            isRead,
            target: notification.target || title,
            description: notification.description || message,
            date: this.formatDate(notification.createdAt),
            image: notification.image,
            type: notification.type,
            location: notification.location,
            locationLabel: notification.locationLabel,
            status: notification.status,
            readed: isRead,
            createdAt: notification.createdAt.toISOString(),
        }
    }

    private formatDate(date: Date) {
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMinutes = Math.floor(diffMs / 60000)

        if (diffMinutes < 1) {
            return 'Just now'
        }

        if (diffMinutes < 60) {
            return `${diffMinutes} min ago`
        }

        const diffHours = Math.floor(diffMinutes / 60)

        if (diffHours < 24) {
            return `${diffHours} hr ago`
        }

        return date.toLocaleString()
    }

    async findAll(limit = 20, userId?: string): Promise<NotificationRecord[]> {
        const where = { ...STAFF_ONLY, ...(userId ? { userId } : {}) }
        const notifications = await this.prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
        })

        return notifications.map((notification) => this.toRecord(notification))
    }

    async getUnreadCount(userId?: string): Promise<number> {
        const where: Prisma.NotificationWhereInput = {
            ...STAFF_ONLY,
            OR: [{ isRead: false }, { readed: false }],
        }
        if (userId) {
            where.userId = userId
        }
        return this.prisma.notification.count({
            where,
        })
    }

    async markAsRead(id: string): Promise<NotificationRecord> {
        const notification = await this.prisma.notification.update({
            where: { id },
            data: { isRead: true, readed: true },
        })

        const record = this.toRecord(notification)
        await this.publishCount()

        return record
    }

    async markAllAsRead(userId?: string): Promise<void> {
        const where: Prisma.NotificationWhereInput = {
            ...STAFF_ONLY,
            OR: [{ isRead: false }, { readed: false }],
        }
        if (userId) {
            where.userId = userId
        }
        await this.prisma.notification.updateMany({
            where,
            data: { isRead: true, readed: true },
        })

        await this.publishCount()
    }

    async create(data: {
        userId?: string | null
        title?: string
        message?: string
        isRead?: boolean
        target?: string
        description?: string
        type?: number
        image?: string
        location?: string
        locationLabel?: string
        status?: string
    }): Promise<NotificationRecord> {
        const title = data.title ?? data.target ?? ''
        const message = data.message ?? data.description ?? ''
        const isRead = data.isRead ?? false

        const notification = await this.prisma.notification.create({
            data: {
                userId: data.userId ?? null,
                title,
                message,
                isRead,
                target: data.target ?? title,
                description: data.description ?? message,
                type: data.type ?? 0,
                image: data.image ?? '',
                location: data.location ?? '',
                locationLabel: data.locationLabel ?? '',
                status: data.status ?? '',
                readed: isRead,
            },
        })

        const record = this.toRecord(notification)
        this.gateway.emitNotification(record)
        await this.publishCount()

        return record
    }

    /**
     * Shopper inbox entry. Never broadcast on the staff socket. With a
     * `dedupeKey`, a repeat (event retry / replay) is a no-op returning null.
     */
    async createForShopper(data: {
        retailClientId: string
        title: string
        message: string
        location?: string
        locationLabel?: string
        status?: string
        dedupeKey?: string
    }): Promise<NotificationRecord | null> {
        try {
            const notification = await this.prisma.notification.create({
                data: {
                    retailClientId: data.retailClientId,
                    title: data.title,
                    message: data.message,
                    target: data.title,
                    description: data.message,
                    location: data.location ?? '',
                    locationLabel: data.locationLabel ?? '',
                    status: data.status ?? 'UNREAD',
                    dedupeKey: data.dedupeKey ?? null,
                    isRead: false,
                    readed: false,
                },
            })
            return this.toRecord(notification)
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                return null
            }
            throw error
        }
    }

    async findForShopper(retailClientId: string, limit = 20): Promise<NotificationRecord[]> {
        const rows = await this.prisma.notification.findMany({
            where: { retailClientId },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(1, limit), 50),
        })
        return rows.map((row) => this.toRecord(row))
    }

    unreadCountForShopper(retailClientId: string): Promise<number> {
        return this.prisma.notification.count({
            where: { retailClientId, isRead: false },
        })
    }

    async markReadForShopper(retailClientId: string, id: string): Promise<void> {
        const res = await this.prisma.notification.updateMany({
            where: { id, retailClientId },
            data: { isRead: true, readed: true },
        })
        if (res.count === 0) throw new NotFoundException('Notification not found')
    }

    async markAllReadForShopper(retailClientId: string): Promise<void> {
        await this.prisma.notification.updateMany({
            where: { retailClientId, isRead: false },
            data: { isRead: true, readed: true },
        })
    }

    async publishCount() {
        const count = await this.getUnreadCount()
        this.gateway.emitCount(count)
    }

    async seedIfEmpty() {
        const count = await this.prisma.notification.count()

        if (count > 0) {
            return
        }

        const seedItems = [
            {
                target: 'System',
                description: 'Welcome to AGCTEK ERP.',
                type: 0,
            },
            {
                target: 'Inventory',
                description: 'Low stock alert for warehouse A.',
                type: 2,
                status: 'failed',
            },
            {
                target: 'Procurement',
                description: 'Purchase order PO-4821 is pending approval.',
                type: 1,
            },
        ]

        for (const item of seedItems) {
            await this.create(item)
        }
    }
}
