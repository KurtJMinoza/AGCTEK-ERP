import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmMessagesService } from './crm-messages.service'
import { AddNoteDto, EditNoteDto, ListFeedQueryDto } from './dto/message.dto'

/**
 * Chatter for one opportunity: the merged feed (messages + activities + SD quotations +
 * sales order link) and author-managed notes. SD data stays in SD; CRM only persists NOTE /
 * SYSTEM messages and merges everything else at read time.
 */
@Controller('crm/opportunities/:id')
export class CrmMessagesController {
    constructor(private readonly messages: CrmMessagesService) {}

    @Get('feed')
    @RequirePermission('crm.opportunities', 'read')
    feed(@Param('id') id: string, @Query() query: ListFeedQueryDto) {
        return this.messages.listFeed(id, query)
    }

    @Post('notes')
    @RequirePermission('crm.opportunities', 'create')
    createNote(
        @Param('id') id: string,
        @Body() dto: AddNoteDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.messages.addNote(id, dto.body, user.id)
    }

    @Patch('notes/:noteId')
    @RequirePermission('crm.opportunities', 'update')
    updateNote(
        @Param('id') id: string,
        @Param('noteId') noteId: string,
        @Body() dto: EditNoteDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.messages.editNote(id, noteId, dto.body, user.id)
    }

    @Delete('notes/:noteId')
    @HttpCode(200)
    @RequirePermission('crm.opportunities', 'delete')
    deleteNote(
        @Param('id') id: string,
        @Param('noteId') noteId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.messages.softDeleteNote(id, noteId, user.id)
    }
}