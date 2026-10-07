import { applyDecorators, UseGuards } from '@nestjs/common'
import { MmAuthGuard } from './mm-auth.guard'
import { RequireMmPermission } from './mm-auth.decorator'
import type { PermissionAction } from '../../permissions/permissions.constants'

/**
 * Guard + resource permission check for MM mutation endpoints, e.g. `@MmMutation(mmFeatures('procurement', 'rfqs'))`.
 * Several resources mean any of them suffices (endpoints shared by features).
 * Without an explicit action: DELETE → delete, POST on a collection route (no `:param`) → create, else update.
 */
export function MmMutation(resource: string | readonly string[], action?: PermissionAction) {
    return applyDecorators(UseGuards(MmAuthGuard), RequireMmPermission(resource, action))
}
