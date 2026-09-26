import type { Ref } from 'vue'

const keyPrefix = import.meta.env['VITE_CACHE_PREFIX'] || 'pika'

const getStorage = (isSession: boolean): Storage =>
  isSession ? window.sessionStorage : window.localStorage

const getCacheName = (key: string): string => `${keyPrefix}_${key}`

export const setStore = (key: string, value: unknown, isSession = false): void => {
  const item = {
    dataType: typeof value,
    content: value,
    datetime: Date.now(),
  }
  getStorage(isSession).setItem(getCacheName(key), JSON.stringify(item))
}

export const getStore = (key: string, isSession = false): unknown => {
  const storedValue = getStorage(isSession).getItem(getCacheName(key))
  if (!storedValue) {
    return undefined
  }
  let item: { dataType: string; content: unknown }
  try {
    item = JSON.parse(storedValue)
  } catch {
    return storedValue
  }
  switch (item.dataType) {
    case 'string':
    case 'object':
      return item.content
    case 'number':
      return Number(item.content)
    case 'boolean':
      return JSON.parse(String(item.content))
    default:
      return undefined
  }
}

export const removeStore = (key: string, isSession = false): void => {
  getStorage(isSession).removeItem(getCacheName(key))
}

export const useStorage = <T>(key: string, defaultValue: T): Ref<T> => {
  const cacheValue = getStore(key)
  if (!cacheValue) {
    setStore(key, defaultValue)
  }
  const value = ref<T>((cacheValue || defaultValue) as T)
  watch(
    value,
    () => {
      if (value.value === undefined) {
        removeStore(key)
      } else {
        setStore(key, value.value)
      }
    },
    { deep: true },
  )
  return value as Ref<T>
}
