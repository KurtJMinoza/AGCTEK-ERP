import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from './notifications.gateway'
import type { NotificationRecord } from './notification.types'

@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationsGateway,
    ) {}

    private toRecord(notification: {
        id: string
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
        return {
            id: notification.id,
            target: notification.target,
            description: notification.description,
            date: this.formatDate(notification.createdAt),
            image: notification.image,
            type: notification.type,
            location: notification.location,
            locationLabel: notification.locationLabel,
            status: notification.status,
            readed: notification.readed,
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

    async findAll(limit = 20): Promise<NotificationRecord[]> {
        const notifications = await this.prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
        })

        return notifications.map((notification) => this.toRecord(notification))
    }

    async getUnreadCount(): Promise<number> {
        return this.prisma.notification.count({
            where: { readed: false },
        })
    }

    async markAsRead(id: string): Promise<NotificationRecord> {
        const notification = await this.prisma.notification.update({
            where: { id },
            data: { readed: true },
        })

        const record = this.toRecord(notification)
        await this.publishCount()

        return record
    }

    async markAllAsRead(): Promise<void> {
        await this.prisma.notification.updateMany({
            where: { readed: false },
            data: { readed: true },
        })

        await this.publishCount()
    }

    async create(data: {
        target: string
        description: string
        type?: number
        image?: string
        location?: string
        locationLabel?: string
        status?: string
    }): Promise<NotificationRecord> {
        const notification = await this.prisma.notification.create({
            data: {
                target: data.target,
                description: data.description,
                type: data.type ?? 0,
                image: data.image ?? '',
                location: data.location ?? '',
                locationLabel: data.locationLabel ?? '',
                status: data.status ?? '',
            },
        })

        const record = this.toRecord(notification)
        this.gateway.emitNotification(record)
        await this.publishCount()

        return record
    }

    async publishCount() {
        const count = await this.getUnreadCount()
        this.gateway.emitCount(count)
    }
}
