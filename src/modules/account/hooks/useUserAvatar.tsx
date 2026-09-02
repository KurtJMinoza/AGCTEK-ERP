'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import { apiGetProfile } from '@/services/AuthService'

type UserAvatarContextValue = {
    avatar: string
    setAvatar: (avatar: string) => void
    refreshAvatar: () => Promise<void>
}

const UserAvatarContext = createContext<UserAvatarContextValue | undefined>(
    undefined,
)

export const UserAvatarProvider = ({ children }: { children: ReactNode }) => {
    const { session } = useCurrentSession()
    const userName = session?.user?.name || ''
    const [avatar, setAvatar] = useState('')

    const refreshAvatar = useCallback(async () => {
        if (!userName) {
            setAvatar('')
            return
        }

        try {
            const profile = await apiGetProfile(userName)
            setAvatar(profile.avatar || '')
        } catch {
            setAvatar('')
        }
    }, [userName])

    useEffect(() => {
        refreshAvatar()
    }, [refreshAvatar])

    const value = useMemo(
        () => ({
            avatar,
            setAvatar,
            refreshAvatar,
        }),
        [avatar, refreshAvatar],
    )

    return (
        <UserAvatarContext.Provider value={value}>
            {children}
        </UserAvatarContext.Provider>
    )
}

const useUserAvatar = () => {
    const context = useContext(UserAvatarContext)

    if (!context) {
        throw new Error('useUserAvatar must be used within UserAvatarProvider')
    }

    return context
}

export default useUserAvatar
