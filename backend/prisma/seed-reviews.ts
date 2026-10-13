import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding mock reviewers and product reviews...')

    const defaultRole = await prisma.role.findFirst({
        where: { isActive: true },
        select: { code: true }
    })
    const roleCode = defaultRole?.code || 'SUPER_ADMIN'

    const mockPeople = [
        {
            email: 'maria.santos@demo.agctek.co',
            userName: 'maria.santos',
            firstName: 'Maria Elena',
            lastName: 'Santos',
            avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        },
        {
            email: 'juan.delacruz@demo.agctek.co',
            userName: 'juan.delacruz',
            firstName: 'Juan Carlos',
            lastName: 'Dela Cruz',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        },
        {
            email: 'jessica.tan@demo.agctek.co',
            userName: 'jessica.tan',
            firstName: 'Jessica Mae',
            lastName: 'Tan',
            avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
        },
        {
            email: 'mark.villafuerte@demo.agctek.co',
            userName: 'mark.villafuerte',
            firstName: 'Mark Anthony',
            lastName: 'Villafuerte',
            avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
        },
        {
            email: 'ana.reyes@demo.agctek.co',
            userName: 'ana.reyes',
            firstName: 'Ana Patricia',
            lastName: 'Reyes',
            avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        },
        {
            email: 'dave.lim@demo.agctek.co',
            userName: 'dave.lim',
            firstName: 'Dave Christian',
            lastName: 'Lim',
            avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
        },
        {
            email: 'bea.gomez@demo.agctek.co',
            userName: 'bea.gomez',
            firstName: 'Bea Beatrice',
            lastName: 'Gomez',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        },
    ]

    const users: any[] = []
    for (const person of mockPeople) {
        let user = await prisma.user.findUnique({
            where: { email: person.email },
        })
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: person.email,
                    userName: person.userName,
                    firstName: person.firstName,
                    lastName: person.lastName,
                    avatar: person.avatar,
                    role: roleCode,
                    passwordHash: '$2b$10$yGuCQYsj4R0ppJwYTGrnkelzHVdVbLkcN0gIcJQy6Gg0gaYvt5pzy',
                    isActive: true,
                },
            })
        } else {
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    firstName: person.firstName,
                    lastName: person.lastName,
                    avatar: person.avatar,
                },
            })
        }
        users.push(user)
    }

    const products = await prisma.sdProduct.findMany({
        where: { isActive: true },
    })

    console.log(`Processing ${products.length} active products with ${users.length} mock reviewers.`)

    const reviewTemplates = [
        {
            rating: 5,
            comment:
                'Hands down one of the best purchases I’ve made this year! Arrived well-packaged and earlier than expected. The build quality feels super durable and works straight out of the box without any hassle.',
            hasImage: true,
            daysAgo: 1,
        },
        {
            rating: 5,
            comment:
                'Extremely satisfied! Very quiet operation, energy efficient, and the design looks very modern in person. Highly recommended for anyone looking for reliable quality.',
            hasImage: true,
            daysAgo: 3,
        },
        {
            rating: 4,
            comment:
                'Great value for money. Performance is top notch and as described in the specs. Delivery rider was also very courteous and assisted in bringing the package inside.',
            hasImage: false,
            daysAgo: 5,
        },
        {
            rating: 5,
            comment:
                'Super fast delivery and pristine condition! Legit item from official dealer. My family really loves the convenience and sleek finish.',
            hasImage: true,
            daysAgo: 8,
        },
        {
            rating: 4,
            comment:
                'Solid performance and nice aesthetics. Setup took only a few minutes following the included manual. Definitely 5-star quality for everyday use.',
            hasImage: false,
            daysAgo: 11,
        },
        {
            rating: 5,
            comment:
                'Five stars! Exceeded my expectations. Packaging was reinforced with bubble wrap and wood strapping. Customer service was also very responsive to my questions.',
            hasImage: true,
            daysAgo: 14,
        },
        {
            rating: 5,
            comment:
                '10/10 purchase! Fast shipping, genuine brand quality, and very responsive customer support. Will definitely order from AGC again!',
            hasImage: true,
            daysAgo: 18,
        },
    ]

    let reviewCount = 0

    for (const product of products) {
        for (let i = 0; i < users.length; i++) {
            const user = users[i]
            const template = reviewTemplates[i % reviewTemplates.length]

            // 1. Ensure DELIVERED order exists for verified purchaser integrity
            const existingOrder = await prisma.sdSalesOrder.findFirst({
                where: {
                    customerId: user.id,
                    status: 'DELIVERED',
                    lines: { some: { productId: product.id } },
                },
            })

            if (!existingOrder) {
                await prisma.sdSalesOrder.create({
                    data: {
                        orderNumber: `SO-DELIV-${randomUUID().slice(0, 8).toUpperCase()}`,
                        customerId: user.id,
                        createdBy: user.id,
                        customerName: `${user.firstName} ${user.lastName}`,
                        customerEmail: user.email,
                        status: 'DELIVERED',
                        channel: 'ECOMMERCE',
                        source: 'WEBSITE',
                        correlationId: `corr-${randomUUID()}`,
                        deliveredAt: new Date(Date.now() - (template.daysAgo + 2) * 24 * 60 * 60 * 1000),
                        lines: {
                            create: [
                                {
                                    lineNumber: 1,
                                    productId: product.id,
                                    sku: product.sku,
                                    description: product.name,
                                    unitPrice: product.price,
                                    lineTotal: product.price,
                                    quantity: 1,
                                },
                            ],
                        },
                    },
                })
            }

            // 2. Check if review already exists
            const existingReview = await prisma.productReview.findFirst({
                where: {
                    productId: product.id,
                    userId: user.id,
                },
            })

            const reviewDate = new Date(Date.now() - template.daysAgo * 24 * 60 * 60 * 1000)
            const attachedImages = template.hasImage && product.imageUrl ? [product.imageUrl] : []

            if (!existingReview) {
                await prisma.productReview.create({
                    data: {
                        productId: product.id,
                        userId: user.id,
                        rating: template.rating,
                        comment: template.comment,
                        imageUrls: attachedImages,
                        createdAt: reviewDate,
                        updatedAt: reviewDate,
                    },
                })
                reviewCount++
            }
        }
    }

    console.log(`Successfully seeded ${reviewCount} new authentic customer reviews!`)
}

main().finally(() => prisma.$disconnect())
