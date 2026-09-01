import SidePanel from '@/components/template/SidePanel'
import Notification from '@/components/template/Notification'
import UserProfileDropdown from '@/components/template/UserProfileDropdown'

const HeaderActions = () => {
    return (
        <>
            <SidePanel hoverable={false} />
            <Notification hoverable={false} />
            <UserProfileDropdown hoverable={false} />
        </>
    )
}

export default HeaderActions
