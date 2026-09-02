import { PiHouseLineDuotone, PiUserDuotone, PiGearDuotone, PiBellDuotone } from 'react-icons/pi'
import type { JSX } from 'react'

export type NavigationIcons = Record<string, JSX.Element>

const navigationIcon: NavigationIcons = {
    home: <PiHouseLineDuotone />,
    profile: <PiUserDuotone />,
    accountSettings: <PiGearDuotone />,
    activityLog: <PiBellDuotone />,
}

export default navigationIcon
