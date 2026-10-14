import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreateProductReviewDto,
    CreateShopperReviewDto,
    ListReviewsQueryDto,
} from './dto/review.dto'

/** Orders whose goods reached the shopper; only these lines can be reviewed. */
export const REVIEWABLE_ORDER_STATUSES = ['DELIVERED', 'COMPLETED'] as const

const REVIEW_AUTHOR_INCLUDE = {
    user: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
            avatar: true,
        },
    },
    retailClient: { select: { id: true, fullName: true } },
} satisfies Prisma.ProductReviewInclude

@Injectable()
export class ReviewService {
    constructor(private readonly prisma: PrismaService) {}

    /** The shopper's own reviews, with the product's division + SKU for order-line matching. */
    async listForShopper(clientId: string) {
        return this.prisma.productReview.findMany({
            where: { retailClientId: clientId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                productId: true,
                salesOrderId: true,
                rating: true,
                comment: true,
                imageUrls: true,
                createdAt: true,
                product: { select: { divisionId: true, sku: true, name: true } },
            },
        })
    }

    /**
     * A shopper reviews a product they received: the order must be theirs and
     * delivered, the line must belong to it, and each product is reviewed once.
     */
    async createForShopper(clientId: string, dto: CreateShopperReviewDto) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: dto.salesOrderId },
            select: {
                id: true,
                customerId: true,
                status: true,
                divisionId: true,
                lines: {
                    where: { id: dto.salesOrderLineId },
                    select: {
                        productId: true,
                        divisionId: true,
                        sku: true,
                        productSkuSnapshot: true,
                    },
                },
            },
        })
        if (!order || order.customerId !== clientId) {
            throw new NotFoundException('Order not found')
        }
        if (
            !(REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(
                order.status,
            )
        ) {
            throw new BadRequestException(
                'You can review items once your order has been delivered',
            )
        }
        const line = order.lines[0]
        if (!line) throw new NotFoundException('Order item not found')

        const productId = await this.resolveLineProductId(line, order.divisionId)
        if (!productId) {
            throw new BadRequestException(
                'This item is no longer in the catalog and cannot be reviewed',
            )
        }

        try {
            return await this.prisma.productReview.create({
                data: {
                    productId,
                    retailClientId: clientId,
                    salesOrderId: order.id,
                    rating: dto.rating,
                    comment: dto.comment.trim(),
                    imageUrls: dto.imageUrls ?? [],
                },
                include: REVIEW_AUTHOR_INCLUDE,
            })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'You have already reviewed this product',
                )
            }
            throw error
        }
    }

    /** Retail lines carry division + SKU (productId is not always stamped). */
    private async resolveLineProductId(
        line: {
            productId: string | null
            divisionId: string | null
            sku: string | null
            productSkuSnapshot: string | null
        },
        orderDivisionId: string | null,
    ): Promise<string | null> {
        if (line.productId) {
            const byId = await this.prisma.sdProduct.findUnique({
                where: { id: line.productId },
                select: { id: true },
            })
            if (byId) return byId.id
        }
        const divisionId = line.divisionId ?? orderDivisionId
        const sku = line.sku ?? line.productSkuSnapshot
        if (!divisionId || !sku) return null
        const product = await this.prisma.sdProduct.findUnique({
            where: { divisionId_sku: { divisionId, sku } },
            select: { id: true },
        })
        return product?.id ?? null
    }

    /**
     * Strictly verifies whether a user is an eligible verified purchaser.
     * Eligible strictly if they have an SdSalesOrder with status DELIVERED
     * containing the current productId (or sku) in its line items.
     */
    async checkEligibility(productId: string, userId: string): Promise<boolean> {
        if (!userId || !productId) return false

        // Resolve product to get its ID and SKU
        const product = await this.prisma.sdProduct.findFirst({
            where: {
                OR: [{ id: productId }, { sku: productId }],
            },
            select: { id: true, sku: true },
        })
        if (!product) return false

        // Resolve user to get id and email
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        })
        if (!user) return false

        // Check if there is a linked retail client by email
        const retailClient = user.email
            ? await this.prisma.retailClient.findUnique({
                  where: { email: user.email },
                  select: { id: true },
              })
            : null

        const customerIds: string[] = [user.id]
        if (retailClient) customerIds.push(retailClient.id)

        // Query for an order with status DELIVERED containing the product in lines
        const deliveredOrder = await this.prisma.sdSalesOrder.findFirst({
            where: {
                status: { in: ['DELIVERED', 'delivered'] },
                OR: [
                    { createdBy: user.id },
                    { customerId: { in: customerIds } },
                    ...(user.email
                        ? [{ customerEmail: { equals: user.email, mode: 'insensitive' as const } }]
                        : []),
                ],
                lines: {
                    some: {
                        OR: [
                            { productId: product.id },
                            ...(product.sku ? [{ sku: product.sku }] : []),
                        ],
                    },
                },
            },
            select: { id: true },
        })

        return !!deliveredOrder
    }

    async create(dto: CreateProductReviewDto, headerUserId?: string) {
        // Resolve target product (by ID or SKU)
        let product = await this.prisma.sdProduct.findUnique({
            where: { id: dto.productId },
        })

        if (!product) {
            product = await this.prisma.sdProduct.findFirst({
                where: { sku: dto.productId },
            })
        }

        if (!product) {
            throw new NotFoundException(`Product with ID/SKU '${dto.productId}' not found`)
        }

        // Resolve user
        const targetUserId = dto.userId || headerUserId
        if (!targetUserId) {
            throw new ForbiddenException('A logged-in user is required to submit a review')
        }

        const user = await this.prisma.user.findUnique({ where: { id: targetUserId } })
        if (!user) {
            throw new ForbiddenException('User not found')
        }

        // Strict verification: user must have an SdSalesOrder with DELIVERED status containing the product
        const isEligible = await this.checkEligibility(product.id, user.id)
        if (!isEligible) {
            throw new ForbiddenException(
                'Only verified purchasers with a delivered order can review this product',
            )
        }

        const review = await this.prisma.productReview.create({
            data: {
                productId: product.id,
                userId: user.id,
                rating: dto.rating,
                comment: dto.comment.trim(),
                imageUrls: dto.imageUrls ?? [],
            },
            include: {
                ...REVIEW_AUTHOR_INCLUDE,
                product: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                    },
                },
            },
        })

        return review
    }

    async findAll(query: ListReviewsQueryDto) {
        let productWhere: { productId?: string } = {}

        if (query.productId) {
            let product = await this.prisma.sdProduct.findUnique({
                where: { id: query.productId },
                select: { id: true },
            })
            if (!product) {
                product = await this.prisma.sdProduct.findFirst({
                    where: { sku: query.productId },
                    select: { id: true },
                })
            }
            if (product) {
                productWhere = { productId: product.id }
            } else {
                return {
                    reviews: [],
                    total: 0,
                    averageRating: 0,
                }
            }
        }

        const reviews = await this.prisma.productReview.findMany({
            where: productWhere,
            orderBy: { createdAt: 'desc' },
            take: query.limit ?? 50,
            include: REVIEW_AUTHOR_INCLUDE,
        })

        const total = reviews.length
        const averageRating =
            total > 0
                ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1))
                : 0

        return {
            reviews,
            total,
            averageRating,
        }
    }

    async getStats(productId: string) {
        let product = await this.prisma.sdProduct.findUnique({
            where: { id: productId },
            select: { id: true },
        })
        if (!product) {
            product = await this.prisma.sdProduct.findFirst({
                where: { sku: productId },
                select: { id: true },
            })
        }

        if (!product) {
            return {
                totalReviews: 0,
                averageRating: 0,
                ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            }
        }

        const reviews = await this.prisma.productReview.findMany({
            where: { productId: product.id },
            select: { rating: true },
        })

        const totalReviews = reviews.length
        const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        let totalSum = 0

        for (const r of reviews) {
            totalSum += r.rating
            ratingCounts[r.rating] = (ratingCounts[r.rating] || 0) + 1
        }

        const averageRating =
            totalReviews > 0 ? Number((totalSum / totalReviews).toFixed(1)) : 0

        return {
            totalReviews,
            averageRating,
            ratingCounts,
        }
    }
}
