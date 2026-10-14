import { NotificationsService } from './notifications.service'

describe('NotificationsService', () => {
    let service: NotificationsService
    let mockPrisma: { notification: Record<string, jest.Mock> }
    let mockGateway: Record<string, jest.Mock>

    beforeEach(() => {
        mockPrisma = {
            notification: {
                findMany: jest.fn(),
                count: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
            },
        }
        mockGateway = {
            emitNotification: jest.fn(),
            emitCount: jest.fn(),
        }
        service = new NotificationsService(mockPrisma as never, mockGateway as never)
    })

    it('creates an in-app notification with title, message, and isRead', async () => {
        const fakeNotification = {
            id: 'notif-1',
            userId: 'user-123',
            title: 'Order Approved',
            message: 'Your order #SO-000001 has been approved and is preparing for delivery.',
            isRead: false,
            target: 'SO-000001',
            description: 'Your order #SO-000001 has been approved and is preparing for delivery.',
            type: 0,
            image: '',
            location: '',
            locationLabel: '',
            status: '',
            readed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        mockPrisma.notification.create.mockResolvedValue(fakeNotification)
        mockPrisma.notification.count.mockResolvedValue(1)

        const result = await service.create({
            userId: 'user-123',
            title: 'Order Approved',
            message: 'Your order #SO-000001 has been approved and is preparing for delivery.',
        })

        expect(mockPrisma.notification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: 'user-123',
                title: 'Order Approved',
                message: 'Your order #SO-000001 has been approved and is preparing for delivery.',
                isRead: false,
            }),
        })
        expect(result.id).toBe('notif-1')
        expect(result.title).toBe('Order Approved')
        expect(result.isRead).toBe(false)
        expect(mockGateway.emitNotification).toHaveBeenCalledWith(result)
    })

    it('marks a notification as read and emits the updated count', async () => {
        const fakeNotification = {
            id: 'notif-1',
            userId: 'user-123',
            title: 'Order Approved',
            message: 'Your order #SO-000001 has been approved and is preparing for delivery.',
            isRead: true,
            target: 'SO-000001',
            description: 'Your order #SO-000001 has been approved and is preparing for delivery.',
            type: 0,
            image: '',
            location: '',
            locationLabel: '',
            status: '',
            readed: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        mockPrisma.notification.update.mockResolvedValue(fakeNotification)
        mockPrisma.notification.count.mockResolvedValue(0)

        const result = await service.markAsRead('notif-1')

        expect(mockPrisma.notification.update).toHaveBeenCalledWith({
            where: { id: 'notif-1' },
            data: { isRead: true, readed: true },
        })
        expect(result.isRead).toBe(true)
        expect(mockGateway.emitCount).toHaveBeenCalledWith(0)
    })

    it('queries unread count filtered by userId', async () => {
        mockPrisma.notification.count.mockResolvedValue(3)

        const count = await service.getUnreadCount('user-123')

        expect(mockPrisma.notification.count).toHaveBeenCalledWith({
            where: {
                retailClientId: null,
                OR: [{ isRead: false }, { readed: false }],
                userId: 'user-123',
            },
        })
        expect(count).toBe(3)
    })

    it('queries notifications list sorted by newest first, optionally filtered by userId', async () => {
        mockPrisma.notification.findMany.mockResolvedValue([])

        await service.findAll(10, 'user-123')

        expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
            where: { retailClientId: null, userId: 'user-123' },
            orderBy: { createdAt: 'desc' },
            take: 10,
        })
    })

    describe('shopper inbox', () => {
        const row = {
            id: 'n1',
            retailClientId: 'shopper1',
            userId: null,
            title: 'Order delivered',
            message: 'Order SO-1 has been delivered.',
            isRead: false,
            target: 'Order delivered',
            description: '',
            type: 0,
            image: '',
            location: '/shop/track/tok',
            locationLabel: 'Track order',
            status: 'UNREAD',
            readed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        it('creates without broadcasting on the staff socket', async () => {
            mockPrisma.notification.create.mockResolvedValue(row)
            const result = await service.createForShopper({
                retailClientId: 'shopper1',
                title: row.title,
                message: row.message,
                location: row.location,
                dedupeKey: 'k1',
            })
            expect(result?.id).toBe('n1')
            expect(mockPrisma.notification.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ retailClientId: 'shopper1', dedupeKey: 'k1' }),
            })
            expect(mockGateway.emitNotification).not.toHaveBeenCalled()
            expect(mockGateway.emitCount).not.toHaveBeenCalled()
        })

        it('treats a duplicate dedupeKey as a no-op', async () => {
            const { Prisma } = jest.requireActual('@prisma/client')
            mockPrisma.notification.create.mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError('dup', {
                    code: 'P2002',
                    clientVersion: 'test',
                }),
            )
            await expect(
                service.createForShopper({
                    retailClientId: 'shopper1',
                    title: 't',
                    message: 'm',
                    dedupeKey: 'k1',
                }),
            ).resolves.toBeNull()
        })

        it("only marks the shopper's own notification as read", async () => {
            mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 })
            await expect(service.markReadForShopper('shopper1', 'other')).rejects.toThrow(
                'Notification not found',
            )
            expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
                where: { id: 'other', retailClientId: 'shopper1' },
                data: { isRead: true, readed: true },
            })
        })
    })
})
