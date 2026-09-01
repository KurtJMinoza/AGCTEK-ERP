'use client'

import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import ActionLink from '@/components/shared/ActionLink'
import SignUpForm from './SignUpForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
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
            bodyClass="p-7 sm:p-8"
        >
            <div className="mb-7">
                <h2 className="text-2xl font-bold heading-text">Sign up</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Create an account for Super Admin or Admin access.
                </p>
            </div>

            {message ? (
                <Alert showIcon className="mb-6" type="danger">
                    <span className="break-all">{message}</span>
                </Alert>
            ) : null}

            <SignUpForm onSignUp={onSignUp} setMessage={setMessage} />

            <div className="mt-7 text-center text-sm text-gray-500 dark:text-gray-400">
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
