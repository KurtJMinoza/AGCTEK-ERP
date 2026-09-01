import { auth } from '@/auth'

export default async function getServerSession() {
    return await auth()
}
