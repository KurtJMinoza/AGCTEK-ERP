import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { CreateJournalEntryDto, ListJournalEntriesQueryDto, ReverseJournalEntryDto } from '../dto/journal-entry.dto'
import { JournalEntryService } from './journal-entry.service'
@Controller('fico/journal-entries')
export class JournalEntryController {
    constructor(private service: JournalEntryService) {}
    @Get() @RequirePermission('fico.journal-entries', 'read') list(@Query() query: ListJournalEntriesQueryDto, @CurrentUser() user: AuthRequestUser) { return this.service.list(query, user) }
    @Get(':id') @RequirePermission('fico.journal-entries', 'read') get(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) { return this.service.get(id, user) }
    @Post() @RequirePermission('fico.journal-entries', 'create') create(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: AuthRequestUser) { return this.service.create(dto, user) }
    @Patch(':id/post') @RequirePermission('fico.journal-entries', 'update') post(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) { return this.service.post(id, user) }
    @Post(':id/reverse') @RequirePermission('fico.journal-reversal', 'create') reverse(@Param('id') id: string, @Body() dto: ReverseJournalEntryDto, @CurrentUser() user: AuthRequestUser) { return this.service.reverse(id, user, dto.postingDate) }
}
