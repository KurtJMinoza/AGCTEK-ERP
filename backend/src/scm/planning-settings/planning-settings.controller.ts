import { Body, Controller, Get, Put } from '@nestjs/common'
import { PlanningSettingsService } from './planning-settings.service'

@Controller('scm/planning-settings')
export class PlanningSettingsController {
    constructor(
        private readonly planningSettingsService: PlanningSettingsService,
    ) {}

    @Get()
    get() {
        return this.planningSettingsService.get()
    }

    @Put()
    update(@Body() body: Record<string, unknown>) {
        return this.planningSettingsService.update(body as never)
    }
}
