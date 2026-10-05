export const APPLIANCES_DIVISION_ID = 'DIV_APPLIANCES' as const

export const APPLIANCE_CATEGORIES = ['Cooling', 'Laundry', 'Kitchen'] as const

export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number]
