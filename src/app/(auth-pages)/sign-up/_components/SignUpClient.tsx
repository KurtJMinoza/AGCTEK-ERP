'use client'

import { useRouter } from 'next/navigation'
import SignUp from '@/components/auth/SignUp'
import { onSignUpWithCredentials } from '@/server/actions/auth/handleSignUp'
import type { OnSignUpPayload } from '@/components/auth/SignUp'

const SignUpClient = () => {
    const router = useRouter()

    const handleSignUp = ({
        values,
        setSubmitting,
        setMessage,
    }: OnSignUpPayload) => {
        setSubmitting(true)

        onSignUpWithCredentials({
            userName: values.userName,
            email: values.email,
            password: values.password,
            role: values.role,
        })
            .then((data) => {
                if (data?.error) {
                    setMessage(data.error)
                    setSubmitting(false)
                    return
                }

                router.push('/sign-in')
            })
            .catch(() => {
                setMessage('Something went wrong!')
                setSubmitting(false)
            })
    }

    return <SignUp onSignUp={handleSignUp} />
}

export default SignUpClient
