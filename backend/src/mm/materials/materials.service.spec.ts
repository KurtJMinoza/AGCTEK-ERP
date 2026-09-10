import { Test, TestingModule } from '@nestjs/testing'
import { MaterialsService } from './materials.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common'

describe('MaterialsService', () => {
    let service: MaterialsService
    let prisma: PrismaService

    let typeId: string
    let categoryId: string
    let uomId: string

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [MaterialsService, PrismaService],
        }).compile()

        service = module.get(MaterialsService)
        prisma = module.get(PrismaService)
        await prisma.onModuleInit()

        const type = await prisma.mmMaterialType.findFirst({ where: { deletedAt: null } })
        const cat = await prisma.mmMaterialCategory.findFirst({ where: { deletedAt: null } })
        const uom = await prisma.mmUom.findFirst({ where: { deletedAt: null } })

        if (!type || !cat || !uom) throw new Error('Seed data missing — run prisma seed first')
        typeId = type.id
        categoryId = cat.id
        uomId = uom.id
    })

    afterAll(async () => {
        await prisma.onModuleDestroy()
    })

    const baseDto = () => ({
        materialCode: `TEST-${Date.now()}`,
        materialName: 'Test Material',
        materialTypeId: typeId,
        materialCategoryId: categoryId,
        baseUomId: uomId,
    })

    it('should create a material with DRAFT status', async () => {
        const dto = baseDto()
        const result = await service.create(dto)
        expect(result.id).toBeDefined()
        expect(result.status).toBe('DRAFT')
        expect(result.materialCode).toBe(dto.materialCode)
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: result.id } })
        await prisma.mmMaterial.delete({ where: { id: result.id } })
    })

    it('should reject duplicate material code', async () => {
        const dto = baseDto()
        const created = await service.create(dto)
        await expect(service.create({ ...baseDto(), materialCode: dto.materialCode }))
            .rejects.toThrow(ConflictException)
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should reject invalid thresholds (min > max)', async () => {
        const dto = { ...baseDto(), minimumStock: 100, maximumStock: 10 }
        await expect(service.create(dto)).rejects.toThrow(BadRequestException)
    })

    it('should activate a DRAFT material', async () => {
        const created = await service.create(baseDto())
        expect(created.status).toBe('DRAFT')
        const activated = await service.activate(created.id)
        expect(activated.status).toBe('ACTIVE')
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should reject activating already active material', async () => {
        const created = await service.create(baseDto())
        await service.activate(created.id)
        await expect(service.activate(created.id)).rejects.toThrow(BadRequestException)
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should deactivate an active material', async () => {
        const created = await service.create(baseDto())
        await service.activate(created.id)
        const deactivated = await service.deactivate(created.id)
        expect(deactivated.status).toBe('INACTIVE')
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should update a material and record audit', async () => {
        const created = await service.create(baseDto())
        const updated = await service.update(created.id, { materialName: 'Updated Name' })
        expect(updated.materialName).toBe('Updated Name')

        const audits = await prisma.mmMaterialAudit.findMany({
            where: { materialId: created.id },
            orderBy: { performedAt: 'desc' },
        })
        expect(audits.length).toBeGreaterThanOrEqual(2)
        expect(audits[0].action).toBe('UPDATE')

        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should reject updating a BLOCKED material', async () => {
        const created = await service.create({ ...baseDto(), status: 'BLOCKED' })
        await expect(service.update(created.id, { materialName: 'New' }))
            .rejects.toThrow(BadRequestException)
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should soft-delete a material', async () => {
        const created = await service.create(baseDto())
        await service.softDelete(created.id)
        const found = await prisma.mmMaterial.findUnique({ where: { id: created.id } })
        expect(found?.deletedAt).not.toBeNull()
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should not find a soft-deleted material', async () => {
        const created = await service.create(baseDto())
        await service.softDelete(created.id)
        await expect(service.findOne(created.id)).rejects.toThrow(NotFoundException)
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })

    it('should reject delete when active batches exist', async () => {
        const created = await service.create({ ...baseDto(), batchManaged: true })
        await prisma.mmBatch.create({
            data: { materialId: created.id, batchNumber: 'B001', status: 'AVAILABLE' },
        })
        await expect(service.softDelete(created.id)).rejects.toThrow(BadRequestException)
        await prisma.mmBatch.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterialAudit.deleteMany({ where: { materialId: created.id } })
        await prisma.mmMaterial.delete({ where: { id: created.id } })
    })
})
