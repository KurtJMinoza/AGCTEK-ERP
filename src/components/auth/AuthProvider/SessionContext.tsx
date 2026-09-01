'use client'

import { createContext } from 'react'
import type { Session } from 'next-auth'

const SessionContext = createContext<Session | null>(null)

export default SessionContext
