import { Injectable } from '@nestjs/common'
import { resolveVisibility } from './dashboard.helpers'

@Injectable()
export class DashboardVisibilityService {
    getVisibility(role?: string, authority?: string) {
        return resolveVisibility(role, authority)
    }
}
