import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService, type RolePermissionInput } from './permissions.service'

export type CreateRoleTemplateInput = {
    code: string
    name: string
    description?: string
    fromRole?: string
    fromTemplate?: string
}

const TEMPLATE_SUMMARY_SELECT = {
    id: true,
    code: true,
    name: true,
    description: true,
    updatedAt: true,
    _count: { select: { permissions: { where: { canRead: true } } } },
} as const

/**
 * Role templates are permission blueprints only. They are never assigned to users and never
 * consulted during authorization; roles copy a template once and stay independent afterwards.
 */
@Injectable()
export class RoleTemplatesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissions: PermissionsService,
    ) {}

    list() {
        return this.prisma.roleTemplate.findMany({
            select: TEMPLATE_SUMMARY_SELECT,
            orderBy: { name: 'asc' },
        })
    }

    async get(code: string) {
        const template = await this.findOrThrow(code)
        const stored = await this.prisma.roleTemplatePermission.findMany({
            where: { templateId: template.id },
            select: { resourceId: true, canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        })
        const byResource = new Map(stored.map(({ resourceId, ...flags }) => [resourceId, flags]))
        return {
            template: { code: template.code, name: template.name, description: template.description },
            groups: await this.permissions.buildMatrix(byResource),
        }
    }

    /** Blank, or a snapshot of a role ("Save as template") or of another template. */
    async create(input: CreateRoleTemplateInput) {
        if (input.fromRole && input.fromTemplate) {
            throw new BadRequestException('Copy from either a role or a template, not both.')
        }
        if (await this.prisma.roleTemplate.findUnique({ where: { code: input.code }, select: { id: true } })) {
            throw new ConflictException(`A template with code "${input.code}" already exists.`)
        }
        await this.assertNameAvailable(input.name)

        const grants = await this.permissions.sourceGrants({ role: input.fromRole, template: input.fromTemplate })

        const created = await this.prisma.$transaction(async (tx) => {
            const template = await tx.roleTemplate.create({
                data: { code: input.code, name: input.name, description: input.description ?? '' },
                select: { id: true },
            })
            if (grants.length) {
                await tx.roleTemplatePermission.createMany({
                    data: grants.map((g) => ({ ...g, templateId: template.id })),
                })
            }
            return template
        })

        return this.prisma.roleTemplate.findUniqueOrThrow({ where: { id: created.id }, select: TEMPLATE_SUMMARY_SELECT })
    }

    async update(code: string, input: { name?: string; description?: string }) {
        const template = await this.findOrThrow(code)
        if (input.name !== undefined && input.name.toLowerCase() !== template.name.toLowerCase()) {
            await this.assertNameAvailable(input.name, template.id)
        }
        return this.prisma.roleTemplate.update({
            where: { id: template.id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
            },
            select: TEMPLATE_SUMMARY_SELECT,
        })
    }

    async updatePermissions(code: string, entries: RolePermissionInput[]) {
        const template = await this.findOrThrow(code)
        const resolved = await this.permissions.resolveEntries(entries)
        await this.prisma.$transaction(
            resolved.map(({ resourceId, flags }) =>
                this.prisma.roleTemplatePermission.upsert({
                    where: { templateId_resourceId: { templateId: template.id, resourceId } },
                    create: { templateId: template.id, resourceId, ...flags },
                    update: flags,
                }),
            ),
        )
        return this.get(template.code)
    }

    /** Safe at any time: roles created from the template keep their own copied permissions. */
    async remove(code: string) {
        const template = await this.findOrThrow(code)
        await this.prisma.roleTemplate.delete({ where: { id: template.id } })
        return { code: template.code, deleted: true }
    }

    private async findOrThrow(code: string) {
        const template = await this.prisma.roleTemplate.findUnique({ where: { code } })
        if (!template) throw new NotFoundException(`Template "${code}" not found.`)
        return template
    }

    private async assertNameAvailable(name: string, excludeId?: string) {
        const clash = await this.prisma.roleTemplate.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        })
        if (clash) throw new ConflictException(`A template named "${name}" already exists.`)
    }
}
