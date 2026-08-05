import { createContext, useContext, useEffect, useState, createElement } from 'react'
import type { ReactNode } from 'react'
import { fetchFlags } from '../api'

type Flags = Record<string, boolean>

const FlagsContext = createContext<Flags>({})

export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Flags>({})

  useEffect(() => {
    fetchFlags().then(setFlags)
  }, [])

  return createElement(FlagsContext.Provider, { value: flags }, children)
}

export function useFlag(name: string): boolean {
  return useContext(FlagsContext)[name] ?? false
}
