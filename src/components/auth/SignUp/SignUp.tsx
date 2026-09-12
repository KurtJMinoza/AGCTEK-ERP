'use client'

import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import ActionLink from '@/components/shared/ActionLink'
import SignUpForm from './SignUpForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import { APP_NAME } from '@/constants/app.constant'
import type { OnSignUp } from './SignUpForm'

type SignUpProps = {
    signInUrl?: string
    onSignUp?: OnSignUp
}

const SignUp = ({ onSignUp, signInUrl = '/sign-in' }: SignUpProps) => {
    const [message, setMessage] = useTimeOutMessage()

    return (
        <Card
            bordered={false}
            className="w-full border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-2xl"
            bodyClass="p-6 sm:p-8 lg:p-10"
        >
            <div className="mb-8 border-b border-gray-200 pb-6 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {APP_NAME}
                </p>
                <h2 className="mt-2 text-2xl font-bold heading-text sm:text-3xl">
                    Create your account
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Register as Super Admin or Admin to access modules, manage operations, and collaborate across your organization.
                </p>
            </div>

            {message ? (
                <Alert showIcon className="mb-6" type="danger">
                    <span className="break-words">{message}</span>
                </Alert>
            ) : null}

            <SignUpForm onSignUp={onSignUp} setMessage={setMessage} />

            <div className="mt-8 border-t border-gray-200 pt-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <span>Already have an account? </span>
                <ActionLink
                    href={signInUrl}
                    className="heading-text font-semibold"
                    themeColor={false}
                >
                    Sign in
                </ActionLink>
            </div>
        </Card>
    )
}

export default SignUp
