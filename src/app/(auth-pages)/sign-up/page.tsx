import Link from 'next/link'
import SignUpClient from './_components/SignUpClient'
import getPublicSettings from '@/server/actions/system/getPublicSettings'
import appConfig from '@/configs/app.config'

const Page = async () => {
    const { allow_user_signup } = await getPublicSettings()

    if (!allow_user_signup) {
        return (
            <div className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xl font-bold heading-text">Sign-up is disabled</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    New accounts are created by a Super Admin. Contact your administrator for access.
                </p>
                <Link
                    href={appConfig.unAuthenticatedEntryPath}
                    className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
                >
                    Back to sign in
                </Link>
            </div>
        )
    }

    return <SignUpClient />
}

export default Page
