import { applyDecorators, UseGuards } from '@nestjs/common'
import { MmAuthGuard } from './mm-auth.guard'
import { MM_MUTATION_ROLES, RequireMmRole } from './mm-auth.decorator'

/** Guard + role check for MM stock mutation endpoints. */
export function MmMutation() {
    return applyDecorators(UseGuards(MmAuthGuard), RequireMmRole(...MM_MUTATION_ROLES))
}
