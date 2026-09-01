'use client'

import Button from '@/components/ui/Button'

type OauthSignInType = 'google' | 'github'

export type OnOauthSignInPayload = {
    type: OauthSignInType
    setMessage?: (message: string) => void
}

export type OnOauthSignIn = (payload: OnOauthSignInPayload) => void

type OauthSignInProps = {
    setMessage?: (message: string) => void
    onOauthSignIn?: OnOauthSignIn
}

const OauthSignIn = ({ onOauthSignIn, setMessage }: OauthSignInProps) => {
    const handleGoogleSignIn = async () => {
        onOauthSignIn?.({ type: 'google', setMessage })
    }

    const handleGithubSignIn = async () => {
        onOauthSignIn?.({ type: 'github', setMessage })
    }

    return (
        <div className="flex items-center gap-2">
            <Button
                className="flex-1"
                type="button"
                onClick={handleGoogleSignIn}
            >
                <div className="flex items-center justify-center gap-2">
                    <img
                        className="h-[25px] w-[25px]"
                        src="/img/others/google.png"
                        alt="Google sign in"
                    />
                    <span>Google</span>
                </div>
            </Button>
            <Button
                className="flex-1"
                type="button"
                onClick={handleGithubSignIn}
            >
                <div className="flex items-center justify-center gap-2">
                    <img
                        className="h-[25px] w-[25px]"
                        src="/img/others/github.png"
                        alt="Google sign in"
                    />
                    <span>Github</span>
                </div>
            </Button>
        </div>
    )
}

export default OauthSignIn
