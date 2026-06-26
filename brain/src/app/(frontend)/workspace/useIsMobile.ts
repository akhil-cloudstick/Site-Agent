'use client'

import { useEffect, useState } from 'react'

/**
 * True on narrow screens (≤ maxWidth). SSR-safe: returns false on the first (server) render
 * and corrects on mount, so the desktop layout is the default and mobile is opt-in once the
 * viewport is known. Used to collapse the side-by-side editor to Chat⇄Preview tabs (B2).
 */
export function useIsMobile(maxWidth = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])
  return isMobile
}
