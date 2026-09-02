'use client'

import classNames from 'classnames'
import { APP_NAME } from '@/constants/app.constant'
import { MODE_DARK } from '@/constants/theme.constant'
import Image from 'next/image'
import useTheme from '@/utils/hooks/useTheme'
import type { CommonProps } from '@/@types/common'
import type { Mode } from '@/@types/theme'

interface LogoProps extends CommonProps {
    type?: 'full' | 'streamline'
    mode?: Mode
    imgClass?: string
    logoWidth?: number
    logoHeight?: number
}

const LOGO_SRC_PATH = '/img/logo/'

const Logo = (props: LogoProps) => {
    const themeMode = useTheme((state) => state.mode)

    const {
        type = 'full',
        mode,
        className,
        imgClass,
        style,
        logoWidth,
        logoHeight,
    } = props

    const resolvedMode = mode ?? themeMode

    const src =
        resolvedMode === MODE_DARK
            ? `${LOGO_SRC_PATH}AGC_WHITE.png`
            : `${LOGO_SRC_PATH}AGC_DARK.png`

    const width = logoWidth || (type === 'full' ? 140 : 48)
    const height = logoHeight || (type === 'full' ? 48 : 48)

    return (
        <div className={classNames('logo', className)} style={style}>
            <Image
                className={classNames('object-contain', imgClass)}
                src={src}
                alt={`${APP_NAME} logo`}
                width={width}
                height={height}
                priority
            />
        </div>
    )
}

export default Logo
