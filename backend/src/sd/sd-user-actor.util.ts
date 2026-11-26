import { PrismaService } from '../prisma/prisma.service'

export type SdActorDisplay = {
    userId: string | null
    fullName: string | null
    employeeCode: string | null
    userName: string | null
}

function fullNameFromUser(user: {
    firstName: string | null
    lastName: string | null
    userName: string | null
}): string | null {
    const combined = [user.firstName, user.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
    return combined || user.userName?.trim() || null
}

/**
 * Resolves a stored actor reference (user id or legacy userName string) for SD audit UI.
 */
export async function resolveSdActor(
    prisma: PrismaService,
    actorRef: string | null | undefined,
): Promise<SdActorDisplay> {
    const ref = actorRef?.trim()
    if (!ref) {
        return {
            userId: null,
            fullName: null,
            employeeCode: null,
            userName: null,
        }
    }

    const byId = await prisma.user.findUnique({
        where: { id: ref },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
            employeeCode: true,
        },
    })
    if (byId) {
        return {
            userId: byId.id,
            fullName: fullNameFromUser(byId),
            employeeCode: byId.employeeCode?.trim() ?? null,
            userName: byId.userName ?? null,
        }
    }

    const byUserName = await prisma.user.findFirst({
        where: { userName: { equals: ref, mode: 'insensitive' } },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
            employeeCode: true,
        },
    })
    if (byUserName) {
        return {
            userId: byUserName.id,
            fullName: fullNameFromUser(byUserName),
            employeeCode: byUserName.employeeCode?.trim() ?? null,
            userName: byUserName.userName ?? null,
        }
    }

    return {
        userId: null,
        fullName: ref,
        employeeCode: null,
        userName: ref,
    }
}

export async function resolveSdActors(
    prisma: PrismaService,
    refs: Array<string | null | undefined>,
): Promise<Map<string, SdActorDisplay>> {
    const unique = [...new Set(refs.map((r) => r?.trim()).filter(Boolean))] as string[]
    const map = new Map<string, SdActorDisplay>()
    await Promise.all(
        unique.map(async (ref) => {
            map.set(ref, await resolveSdActor(prisma, ref))
        }),
    )
    return map
}