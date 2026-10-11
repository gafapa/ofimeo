import { t } from './i18n'

export function reportStorageError(error: unknown): Error {
  const failure = new Error(t('Your changes could not be saved. Check browser storage and available space, then make a backup.'), { cause: error })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ofimeo-storage-error', { detail: failure.message }))
  return failure
}
