import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from '../permissions/permissions.service'
import {
    ACTIVITY_SOURCES,
    BASELINE_SEEN_KEY,
    SEEN_KEYS,
    moduleSeenKey,
    type ActivityModel,
} from './module-activity.registry'

type CountableDelegate = {
    count(args: { where: { createdAt: { gt: Date } } }): Promise<number>
}

export type ModuleActivitySummary = {
    /** New records per module (sidebar), since the module or the page was last opened. */
    modules: Record<string, number>
    /**
     * New records per page path. Feature pages count since they were last opened; hub pages sum
     * their features since the hub or the feature was last opened.
     */
    pages: Record<string, number>
}

@Injectable()
export class ModuleActivityService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissions: PermissionsService,
    ) {}

    async summary(userId: string): Promise<ModuleActivitySummary> {
        const { permissions } = await this.permissions.resolveForUser(userId)
        const sources = ACTIVITY_SOURCES.filter(
            (source) => permissions.resources[source.permission]?.canRead,
        )
        const seen = await this.seenTimes(userId)
        const baseline = seen.get(BASELINE_SEEN_KEY) ?? new Date()
        const cutoff = (...keys: (string | undefined)[]) =>
            new Date(
                Math.max(
                    baseline.getTime(),
                    ...keys.map((key) => (key ? seen.get(key)?.getTime() ?? 0 : 0)),
                ),
            )

        const counts = new Map<string, Promise<number>>()
        const countSince = (model: ActivityModel, since: Date) => {
            const memoKey = `${model}@${since.getTime()}`
            let pending = counts.get(memoKey)
            if (!pending) {
                const delegate = this.prisma[model] as unknown as CountableDelegate
                pending = delegate.count({ where: { createdAt: { gt: since } } })
                counts.set(memoKey, pending)
            }
            return pending
        }

        const rows = await Promise.all(
            sources.map(async (source) => ({
                source,
                own: await countSince(source.model, cutoff(source.path)),
                inHub: source.hub
                    ? await countSince(source.model, cutoff(source.path, source.hub))
                    : 0,
                inModule: await countSince(
                    source.model,
                    cutoff(source.path, source.hub, moduleSeenKey(source.module)),
                ),
            })),
        )

        const modules: Record<string, number> = {}
        const pages: Record<string, number> = {}
        for (const { source, own, inHub, inModule } of rows) {
            pages[source.path] = own
            if (source.hub) pages[source.hub] = (pages[source.hub] ?? 0) + inHub
            modules[source.module] = (modules[source.module] ?? 0) + inModule
        }
        return { modules, pages }
    }

    /** Records that the user opened these modules / pages now. Unknown keys are ignored. */
    async markSeen(userId: string, keys: readonly string[]) {
        const known = [...new Set(keys)].filter((key) => SEEN_KEYS.has(key))
        if (!known.length) return { marked: 0 }
        const seenAt = new Date()
        await this.prisma.$transaction(
            known.map((key) =>
                this.prisma.userModuleSeen.upsert({
                    where: { userId_key: { userId, key } },
                    create: { userId, key, seenAt },
                    update: { seenAt },
                }),
            ),
        )
        return { marked: known.length }
    }

    /** Last-seen times; the first call stamps a baseline so existing data is not reported as new. */
    private async seenTimes(userId: string) {
        const rows = await this.prisma.userModuleSeen.findMany({
            where: { userId },
            select: { key: true, seenAt: true },
        })
        const seen = new Map(rows.map((row) => [row.key, row.seenAt]))
        if (!seen.has(BASELINE_SEEN_KEY)) {
            const baseline = await this.prisma.userModuleSeen.upsert({
                where: { userId_key: { userId, key: BASELINE_SEEN_KEY } },
                create: { userId, key: BASELINE_SEEN_KEY, seenAt: new Date() },
                update: {},
            })
            seen.set(BASELINE_SEEN_KEY, baseline.seenAt)
        }
        return seen
    }
}
