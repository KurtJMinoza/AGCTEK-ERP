import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { RetailModule } from '../../retail/retail.module'
import { ReviewController } from './review.controller'
import { ReviewService } from './review.service'

@Module({
    imports: [PrismaModule, forwardRef(() => RetailModule)],
    controllers: [ReviewController],
    providers: [ReviewService],
    exports: [ReviewService],
})
export class ReviewModule {}
