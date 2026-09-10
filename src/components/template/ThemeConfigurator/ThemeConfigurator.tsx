import ModeSwitcher from './ModeSwitcher'
import LayoutSwitcher from './LayoutSwitcher'
import ThemeSwitcher from './ThemeSwitcher'
import DirectionSwitcher from './DirectionSwitcher'

const ThemeConfigurator = () => {
    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-col gap-y-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h6>Dark Mode</h6>
                        <span>Switch theme to dark mode</span>
                    </div>
                    <ModeSwitcher />
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <h6>Direction</h6>
                        <span>Select a direction</span>
                    </div>
                    <DirectionSwitcher />
                </div>
                <div>
                    <h6 className="mb-3">Theme</h6>
                    <ThemeSwitcher />
                </div>
                <div>
                    <h6 className="mb-3">Layout</h6>
                    <LayoutSwitcher />
                </div>
            </div>
        </div>
    )
}

export default ThemeConfigurator
