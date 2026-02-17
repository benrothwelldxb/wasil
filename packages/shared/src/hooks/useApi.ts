import { useState, useEffect, useCallback } from 'react'

interface UseApiState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
}

interface UseApiReturn<T> extends UseApiState<T> {
  refetch: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: true,
    error: null,
  })

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const data = await fetcher()
      setState({ data, isLoading: false, error: null })
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      }))
    }
  }, deps)

  useEffect(() => {
    fetch()
  }, [fetch])

  const setData = useCallback((value: React.SetStateAction<T | null>) => {
    setState(prev => ({
      ...prev,
      data: typeof value === 'function' ? (value as (prev: T | null) => T | null)(prev.data) : value,
    }))
  }, [])

  return {
    ...state,
    refetch: fetch,
    setData,
  }
}

export function useMutation<T, A extends unknown[]>(
  mutator: (...args: A) => Promise<T>
): {
  mutate: (...args: A) => Promise<T>
  isLoading: boolean
  error: Error | null
  reset: () => void
} {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(
    async (...args: A) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await mutator(...args)
        setIsLoading(false)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        setIsLoading(false)
        throw error
      }
    },
    [mutator]
  )

  const reset = useCallback(() => {
    setError(null)
  }, [])

  return { mutate, isLoading, error, reset }
}
