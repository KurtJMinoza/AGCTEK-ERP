import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { BarcodeRegistryService } from './barcode-registry.service'
import { RfidTagService } from './rfid-tag.service'
import { ScanSessionService } from './scan-session.service'
import { ScanOverrideService } from './scan-override.service'
import { ControlledDocumentService } from './controlled-document.service'
import { ComplianceAuditService } from './compliance-audit.service'
import { ComplianceDashboardService } from './compliance-dashboard.service'
import { MobileDeviceService } from '../scanner/mobile-device.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'
import {
    RegistryQueryDto,
    CreateRegistryBarcodeDto,
    StartScanSessionDto,
    CreateScanOverrideDto,
    DecideScanOverrideDto,
    AssignRfidTagDto,
    RfidReadDto,
    CreateControlledDocumentDto,
    ApproveControlledDocDto,
    ComplianceAuditQueryDto,
    ListDevicesQueryDto,
    RegisterDeviceAdminDto,
} from './dto/supporting-ops.dto'

const BARCODE_READERS = mmFeatures(
    'barcode-rfid',
    'barcode-registry',
    'barcode-scanning',
    'rfid-tags',
    'mobile-receiving',
    'mobile-picking',
    'mobile-counting',
    'mobile-putaway',
    'warehouse-devices',
)

const SUPPORT_READERS = [
    ...BARCODE_READERS,
    ...mmFeatures(
        'supporting-operations',
        'document-management',
        'audit-trail',
        'compliance-dashboard',
    ),
]

@Controller('mm/supporting-ops')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SupportingOpsController {
    constructor(
        private barcodes: BarcodeRegistryService,
        private rfid: RfidTagService,
        private sessions: ScanSessionService,
        private overrides: ScanOverrideService,
        private documents: ControlledDocumentService,
        private audit: ComplianceAuditService,
        private complianceDashboard: ComplianceDashboardService,
        private devices: MobileDeviceService,
    ) {}

    @Get('barcode-registry')
    @MmRead(BARCODE_READERS)
    listBarcodes(@Query() query: RegistryQueryDto) {
        return this.barcodes.list(query)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'barcode-registry'), 'create')
    @Post('barcode-registry')
    createBarcode(@Body() dto: CreateRegistryBarcodeDto) {
        return this.barcodes.create(dto)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'barcode-registry'), 'update')
    @Post('barcode-registry/:id/archive')
    archiveBarcode(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.barcodes.archive(id, body.performedBy)
    }

    @Get('rfid-tags')
    @MmRead(BARCODE_READERS)
    listRfid(@Query() query: RegistryQueryDto & { companyId: string }) {
        return this.rfid.list(query as any)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'rfid-tags'), 'create')
    @Post('rfid-tags/assign')
    assignRfid(@Body() dto: AssignRfidTagDto) {
        return this.rfid.assign(dto)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'rfid-tags'), 'update')
    @Post('rfid-tags/read')
    readRfid(@Body() dto: RfidReadDto) {
        return this.rfid.recordRead(dto)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'rfid-tags'), 'delete')
    @Post('rfid-tags/:id/archive')
    archiveRfid(
        @Param('id') id: string,
        @Body() body: { companyId: string; performedBy?: string },
    ) {
        return this.rfid.archive(id, body.companyId, body.performedBy)
    }

    @MmMutation(BARCODE_READERS)
    @Post('scan-sessions/start')
    startSession(@Body() dto: StartScanSessionDto) {
        return this.sessions.start(dto)
    }

    @MmMutation(BARCODE_READERS)
    @Post('scan-sessions/:id/complete')
    completeSession(@Param('id') id: string, @Body() body: { userId?: string }) {
        return this.sessions.complete(id, body.userId)
    }

    @Get('scan-overrides')
    @MmRead(BARCODE_READERS)
    listOverrides(@Query() query: { companyId: string; status?: string; page?: number }) {
        return this.overrides.list(query)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'barcode-scanning'), 'create')
    @Post('scan-overrides')
    createOverride(@Body() dto: CreateScanOverrideDto) {
        return this.overrides.create(dto)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'barcode-scanning'), 'update')
    @Post('scan-overrides/:id/decide')
    decideOverride(@Param('id') id: string, @Body() dto: DecideScanOverrideDto) {
        return this.overrides.approve(
            id,
            dto.approverId,
            dto.decision === 'REJECT' ? { reject: true } : undefined,
        )
    }

    @Get('controlled-documents')
    @MmRead(mmFeatures('supporting-operations', 'document-management'))
    listDocuments(@Query() query: { companyId: string; status?: string; page?: number }) {
        return this.documents.list(query)
    }

    @MmMutation(mmFeatures('supporting-operations', 'document-management'), 'create')
    @Post('controlled-documents')
    createDocument(@Body() dto: CreateControlledDocumentDto) {
        return this.documents.create(dto)
    }

    @Get('controlled-documents/:id')
    @MmRead(mmFeatures('supporting-operations', 'document-management'))
    getDocument(@Param('id') id: string) {
        return this.documents.getOne(id)
    }

    @MmMutation(mmFeatures('supporting-operations', 'document-management'), 'update')
    @Post('controlled-documents/:id/submit')
    submitDocument(@Param('id') id: string, @Body() body: { userId: string }) {
        return this.documents.submitForReview(id, body.userId)
    }

    @MmMutation(mmFeatures('supporting-operations', 'document-management'), 'update')
    @Post('controlled-documents/:id/approve')
    approveDocument(@Param('id') id: string, @Body() dto: ApproveControlledDocDto) {
        return this.documents.approveVersion({ documentId: id, ...dto })
    }

    @MmMutation(mmFeatures('supporting-operations', 'document-management'), 'update')
    @Post('controlled-documents/:id/versions')
    uploadVersion(
        @Param('id') id: string,
        @Body()
        body: {
            revisionNumber: string
            fileName: string
            contentBase64: string
            mimeType?: string
            changeSummary?: string
            authorUserId?: string
        },
    ) {
        const buffer = Buffer.from(body.contentBase64, 'base64')
        return this.documents.addVersion({
            documentId: id,
            revisionNumber: body.revisionNumber,
            fileName: body.fileName,
            buffer,
            mimeType: body.mimeType,
            changeSummary: body.changeSummary,
            authorUserId: body.authorUserId,
        })
    }

    @Get('compliance-audit')
    @MmRead(mmFeatures('supporting-operations', 'audit-trail', 'compliance-dashboard'))
    listAudit(@Query() query: ComplianceAuditQueryDto) {
        return this.audit.list(query)
    }

    @Get('compliance-dashboard/summary')
    @MmRead(mmFeatures('supporting-operations', 'compliance-dashboard'))
    complianceSummary(@Query('companyId') companyId: string) {
        return this.complianceDashboard.summary(companyId)
    }

    @Get('warehouse-devices')
    @MmRead(mmFeatures('barcode-rfid', 'warehouse-devices'))
    listDevices(@Query() query: ListDevicesQueryDto) {
        return this.devices.list(query)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'warehouse-devices'), 'create')
    @Post('warehouse-devices')
    registerDevice(@Body() dto: RegisterDeviceAdminDto) {
        return this.devices.registerAdmin(dto)
    }

    @MmMutation(mmFeatures('barcode-rfid', 'warehouse-devices'), 'delete')
    @Post('warehouse-devices/revoke')
    revokeDevice(@Body() body: { deviceCode: string; revokedBy?: string }) {
        return this.devices.revokeWithAudit(body.deviceCode, body.revokedBy)
    }
}
