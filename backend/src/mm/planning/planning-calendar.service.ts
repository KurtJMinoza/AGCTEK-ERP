import { Injectable } from '@nestjs/common'
import type { PlanningCalendarPort } from './planning-calendar.port'
import { CalendarDayPlanningCalendar } from './calendar-day-planning-calendar'

export type PlanningCalendarScope = {
    companyId: string
    plantId?: string | null
    warehouseId?: string | null
}

@Injectable()
export class PlanningCalendarService {
    /** Phase 2B: calendar-day default until org calendar models exist. */
    resolve(_scope: PlanningCalendarScope): PlanningCalendarPort {
        return new CalendarDayPlanningCalendar()
    }
}
