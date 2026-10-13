export type NotificationItem = {
    id: string
    userId?: string
    title?: string
    message?: string
    isRead?: boolean
    target: string
    description: string
    date: string
    image: string
    type: number
    location: string
    locationLabel: string
    status: string
    readed: boolean
    createdAt?: string
}

