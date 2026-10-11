// A successful request is not a committed write: the transaction may still abort.
export function committedRequest<T>(database: IDBDatabase, store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(store, mode)
    let result: T
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error ?? new Error('Storage transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted'))
    try {
      const request = operation(transaction.objectStore(store))
      request.onsuccess = () => { result = request.result as T }
      request.onerror = () => reject(request.error ?? new Error('Storage request failed'))
    } catch (error) {
      try { transaction.abort() } catch { /* The transaction may already be inactive. */ }
      reject(error)
    }
  })
}
