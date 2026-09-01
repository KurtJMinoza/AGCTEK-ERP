import appConfig from '@/configs/app.config'
import { redirect } from 'next/navigation'

const Page = () => {
    redirect(appConfig.authenticatedEntryPath)
}

export default Page
