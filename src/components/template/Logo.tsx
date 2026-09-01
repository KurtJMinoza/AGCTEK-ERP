import classNames from 'classnames'
import { APP_NAME } from '@/constants/app.constant'
import Image from 'next/image'
import type { CommonProps } from '@/@types/common'

interface LogoProps extends CommonProps {
    type?: 'full' | 'streamline'
    mode?: 'light' | 'dark'
    imgClass?: string
    logoWidth?: number
    logoHeight?: number
}

const LOGO_SRC_PATH = '/img/logo/'

const Logo = (props: LogoProps) => {
    const {
        type = 'full',
        mode = 'light',
        className,
        imgClass,
        style,
        logoWidth,
        logoHeight,
    } = props

    const src =
        mode === 'light'
            ? `${LOGO_SRC_PATH}AGC_DARK.png`
            : `${LOGO_SRC_PATH}AGC_WHITE.png`

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
