import { BadRequestException, Injectable } from '@nestjs/common'
import { PlanningBucketSize } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { optionalNumber, optionalString } from '../scm.utils'

const SETTINGS_ID = 'default'
const BUCKETS = new Set(Object.values(PlanningBucketSize))

type UpdatePlanningSettingsBody = {
    horizonWeeks?: number
    bucketSize?: PlanningBucketSize | string
    frozenZoneDays?: number
}

@Injectable()
export class PlanningSettingsService {
    constructor(private readonly prisma: PrismaService) {}

    async get() {
        return this.prisma.scmPlanningSettings.upsert({
            where: { id: SETTINGS_ID },
            create: { id: SETTINGS_ID },
            update: {},
        })
    }

    async update(body: UpdatePlanningSettingsBody) {
        const data: {
            horizonWeeks?: number
            bucketSize?: PlanningBucketSize
            frozenZoneDays?: number
        } = {}

        const horizonWeeks = optionalNumber(body.horizonWeeks)
        if (horizonWeeks != null) {
            if (!Number.isInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 104) {
                throw new BadRequestException(
                    'horizonWeeks must be an integer between 1 and 104',
                )
            }
            data.horizonWeeks = horizonWeeks
        }

        const bucketRaw = optionalString(body.bucketSize)
        if (bucketRaw != null) {
            if (!BUCKETS.has(bucketRaw as PlanningBucketSize)) {
                throw new BadRequestException(
                    `bucketSize must be one of: ${[...BUCKETS].join(', ')}`,
                )
            }
            data.bucketSize = bucketRaw as PlanningBucketSize
        }

        const frozenZoneDays = optionalNumber(body.frozenZoneDays)
        if (frozenZoneDays != null) {
            if (
                !Number.isInteger(frozenZoneDays) ||
                frozenZoneDays < 0 ||
                frozenZoneDays > 365
            ) {
                throw new BadRequestException(
                    'frozenZoneDays must be an integer between 0 and 365',
                )
            }
            data.frozenZoneDays = frozenZoneDays
        }

        if (Object.keys(data).length === 0) {
            throw new BadRequestException('No valid planning settings fields provided')
        }

        return this.prisma.scmPlanningSettings.upsert({
            where: { id: SETTINGS_ID },
            create: { id: SETTINGS_ID, ...data },
            update: data,
        })
    }
}
