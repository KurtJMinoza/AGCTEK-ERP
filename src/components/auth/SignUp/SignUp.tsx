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
            bodyClass="p-4 sm:p-6"
        >
            <div className="mb-4">
                <h2 className="text-xl font-bold heading-text sm:text-2xl">
                    Create account
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                    Register for AGCTEK ERP access.
                </p>
            </div>

            {message ? (
                <Alert showIcon className="mb-4" type="danger">
                    <span className="break-words text-sm">{message}</span>
                </Alert>
            ) : null}

            <SignUpForm onSignUp={onSignUp} setMessage={setMessage} />

            <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                <span>Already have an account? </span>
                <ActionLink
                    href={signInUrl}
                    className="heading-text font-semibold"
                    themeColor={false}
                >
                    Sign in
                </ActionLink>
            </div>

            <p className="mt-4 text-center text-[11px] text-gray-400 dark:text-gray-500">
                Developed by{' '}
                <a
                    href="https://www.facebook.com/AGCTechSolutions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                >
                    AGCTek
                </a>
            </p>
        </Card>
    )
}

export default SignUp
