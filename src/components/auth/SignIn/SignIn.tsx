'use client'

import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import SignInForm from './SignInForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import type { OnSignIn } from './SignInForm'

type SignInProps = {
    onSignIn?: OnSignIn
}

const SignIn = ({ onSignIn }: SignInProps) => {
    const [message, setMessage] = useTimeOutMessage()

    return (
        <Card
            bordered={false}
            className="w-full border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-2xl"
            bodyClass="p-7 sm:p-8"
        >
            <div className="mb-7">
                <h2 className="text-2xl font-bold heading-text">Sign in</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Enter your credentials to access your workspace.
                </p>
            </div>

            {message ? (
                <Alert showIcon className="mb-6" type="danger">
                    <span className="break-all">{message}</span>
                </Alert>
            ) : null}

            <SignInForm setMessage={setMessage} onSignIn={onSignIn} />

            <p className="mt-7 text-center text-xs text-gray-400 dark:text-gray-500">
                Need help? Contact your system administrator.
            </p>
        </Card>
    )
}

export default SignIn
