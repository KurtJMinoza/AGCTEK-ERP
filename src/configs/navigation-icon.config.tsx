import {

    PiHouseLineDuotone,

    PiUserDuotone,

    PiGearDuotone,

    PiBellDuotone,

    PiShieldCheckDuotone,

} from 'react-icons/pi'

import type { JSX } from 'react'



export type NavigationIcons = Record<string, JSX.Element>



const navigationIcon: NavigationIcons = {

    home: <PiHouseLineDuotone />,

    profile: <PiUserDuotone />,

    accountSettings: <PiGearDuotone />,

    activityLog: <PiBellDuotone />,

    superAdminSettings: <PiShieldCheckDuotone />,

}



export default navigationIcon

