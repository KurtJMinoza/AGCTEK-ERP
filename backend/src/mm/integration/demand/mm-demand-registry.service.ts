import { Inject, Injectable, Logger } from '@nestjs/common'
import type { MmDemandQuery, MmNormalizedDemandLine } from './mm-demand.types'
import {
    MM_DEMAND_PROVIDERS,
    type MmDemandProvider,
} from './mm-demand-provider.port'

@Injectable()
export class MmDemandRegistryService {
    private readonly logger = new Logger(MmDemandRegistryService.name)

    constructor(
        @Inject(MM_DEMAND_PROVIDERS)
        private providers: MmDemandProvider[],
    ) {}

    listRegisteredModules(): string[] {
        return this.providers.map((p) => p.moduleId)
    }

    /** Aggregate open demand from all registered providers — single MRP entry point. */
    async listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]> {
        const results: MmNormalizedDemandLine[] = []
        for (const provider of this.providers) {
            try {
                const lines = await provider.listOpenDemand(query)
                results.push(...lines)
            } catch (err: any) {
                this.logger.warn(
                    `Demand provider ${provider.moduleId} failed: ${err?.message ?? err}`,
                )
            }
        }
        return results.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority
            return a.requiredDate.getTime() - b.requiredDate.getTime()
        })
    }
}
