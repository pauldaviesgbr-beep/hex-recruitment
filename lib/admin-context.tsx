'use client'

import { createContext, useContext } from 'react'

interface AdminContextType {
  accessToken: string | null
}

export const AdminContext = createContext<AdminContextType>({ accessToken: null })

export function useAdminToken() {
  return useContext(AdminContext).accessToken
}
