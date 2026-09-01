import { useTranslations } from 'next-intl'

export const useTranslation = (namespace?: string) => {
    return useTranslations(namespace)
}

export default useTranslation
