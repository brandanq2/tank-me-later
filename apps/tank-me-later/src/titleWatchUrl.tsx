import { useEffect } from 'react'

/**
 * Title Watch and the Command Room moved to their own Vercel project. Set
 * VITE_TITLE_WATCH_URL in this project's Vercel environment variables to point
 * at it; the fallback is the default preview domain.
 *
 * Once the destination has a stable custom domain, prefer a real 308 in
 * vercel.json over this client-side hop:
 *   { "source": "/watch", "destination": "https://…", "permanent": true }
 */
export const TITLE_WATCH_URL: string =
  import.meta.env.VITE_TITLE_WATCH_URL ?? 'https://title-watch.vercel.app'

export function RedirectToTitleWatch({ path = '' }: { path?: string }) {
  useEffect(() => {
    window.location.replace(`${TITLE_WATCH_URL}${path}`)
  }, [path])

  return (
    <p className="empty">
      Title Watch has moved — <a href={`${TITLE_WATCH_URL}${path}`}>continue to {TITLE_WATCH_URL}{path}</a>
    </p>
  )
}
