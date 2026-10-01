import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { seedMmOrg } from './seed-mm-org'

const prisma = new PrismaClient()

async function main() {
    await seedMmOrg(prisma)

    // Demo driver for Expo app (apps/driver)
    const driverUserName = 'driver01'
    const driverEmail = 'driver01@agctek.local'
    const passwordHash = await bcrypt.hash('123Qwe', 10)
    const driverUser = await prisma.user.upsert({
        where: { userName: driverUserName },
        create: {
            email: driverEmail,
            userName: driverUserName,
            passwordHash,
            role: 'admin',
        },
        update: {
            passwordHash,
        },
    })

    const licenseExpiry = new Date()
    licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 2)

    await prisma.driver.upsert({
        where: { userId: driverUser.id },
        create: {
            userId: driverUser.id,
            employeeCode: 'DRV-001',
            firstName: 'Juan',
            lastName: 'Reyes',
            licenseNumber: 'D-L01-SEED-001',
            licenseExpiry,
            phone: '+63 917 000 0001',
            status: 'AVAILABLE',
        },
        update: {
            firstName: 'Juan',
            lastName: 'Reyes',
            phone: '+63 917 000 0001',
            employeeCode: 'DRV-001',
            status: 'AVAILABLE',
        },
    })

    console.log(
        'Seeded driver user driver01 / 123Qwe (linked Driver profile for Expo app).',
    )
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
