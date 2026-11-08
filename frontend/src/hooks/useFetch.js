/**
 * useFetch — generic data-fetching hook.
 *
 * @param {() => Promise} fetcher  — async function returning an axios response
 * @param {any[]} deps             — dependency array (re-fetches when changed)
 *
 * Returns { data, loading, error, refetch }
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export function useFetch(fetcher, deps = []) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    // Re-arm the mounted guard every time fetch() is called.
    // Without this, calling refetch() after the component's effect cleanup
    // has set mountedRef.current = false would silently drop all state updates.
    mountedRef.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetcher()
      if (mountedRef.current) setData(res.data)
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? 'Failed to load data.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
