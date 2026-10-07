import Link from 'next/link'
import getPublicSettings from '@/server/actions/system/getPublicSettings'
import getServerSession from '@/server/actions/auth/getServerSession'
import handleSignOut from '@/server/actions/auth/handleSignOut'
import appConfig from '@/configs/app.config'
import { PiWrenchDuotone } from 'react-icons/pi'

export const metadata = {
    title: 'Maintenance | AGCTEK ERP',
}

const BUTTON_CLASS =
    'inline-flex h-9 items-center rounded-xl px-4 text-sm font-semibold transition-colors'

const MaintenancePage = async () => {
    const [{ maintenance_mode }, session] = await Promise.all([
        getPublicSettings(),
        getServerSession(),
    ])

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
            <div className="max-w-md text-center">
                <PiWrenchDuotone className="mx-auto text-6xl text-primary" />
                <h2 className="mt-4 text-2xl font-bold heading-text">
                    {maintenance_mode ? 'Undergoing Maintenance' : 'We are back'}
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {maintenance_mode
                        ? 'The system is currently undergoing maintenance. Please try again later.'
                        : 'Maintenance is finished. You can continue using AGCTEK ERP.'}
                </p>
                <div className="mt-6 flex justify-center gap-2">
                    {!maintenance_mode && (
                        <Link
                            href={
                                session
                                    ? appConfig.authenticatedEntryPath
                                    : appConfig.unAuthenticatedEntryPath
                            }
                            className={`${BUTTON_CLASS} bg-primary text-white hover:bg-primary-mild`}
                        >
                            Continue
                        </Link>
                    )}
                    {session && (
                        <form action={handleSignOut}>
                            <button
                                type="submit"
                                className={`${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200`}
                            >
                                Sign out
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MaintenancePage
