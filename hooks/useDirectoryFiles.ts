'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LocalFile,
  isFileSystemAccessSupported,
  pickDirectory,
  readDirectoryFiles,
  saveDirectoryHandle,
  loadDirectoryHandle,
  clearDirectoryHandle,
} from '@/lib/file-system'

interface UseDirectoryFilesReturn {
  files: LocalFile[]
  isLoading: boolean
  error: string | null
  directoryName: string | null
  hasStoredHandle: boolean
  isSupported: boolean
  selectDirectory: () => Promise<void>
  reconnectDirectory: () => Promise<void>
  refreshFiles: () => Promise<void>
  disconnectDirectory: () => Promise<void>
}

export function useDirectoryFiles(): UseDirectoryFilesReturn {
  const [files, setFiles] = useState<LocalFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [directoryName, setDirectoryName] = useState<string | null>(null)
  const [hasStoredHandle, setHasStoredHandle] = useState(false)
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const isSupported = isFileSystemAccessSupported()

  // Check of er een opgeslagen handle is bij mount
  useEffect(() => {
    if (!isSupported) return

    loadDirectoryHandle().then((handle) => {
      if (handle) {
        setHasStoredHandle(true)
        setDirectoryName(handle.name)
      }
    })
  }, [isSupported])

  // Nieuwe map selecteren
  const selectDirectory = useCallback(async () => {
    if (!isSupported) return

    setError(null)
    setIsLoading(true)

    try {
      const handle = await pickDirectory()
      if (!handle) {
        // Gebruiker heeft geannuleerd
        setIsLoading(false)
        return
      }

      const dirFiles = await readDirectoryFiles(handle)
      await saveDirectoryHandle(handle)

      setCurrentHandle(handle)
      setDirectoryName(handle.name)
      setHasStoredHandle(true)
      setFiles(dirFiles)
    } catch {
      setError('Kon de map niet lezen. Probeer het opnieuw.')
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  // Opgeslagen map opnieuw verbinden (vereist user gesture)
  const reconnectDirectory = useCallback(async () => {
    if (!isSupported) return

    setError(null)
    setIsLoading(true)

    try {
      const handle = await loadDirectoryHandle()
      if (!handle) {
        setHasStoredHandle(false)
        setIsLoading(false)
        return
      }

      // Vraag opnieuw toestemming (vereist user gesture)
      const permission = await handle.requestPermission({ mode: 'read' })
      if (permission !== 'granted') {
        setError('Toegang tot de map is geweigerd. Selecteer de map opnieuw.')
        await clearDirectoryHandle()
        setHasStoredHandle(false)
        setIsLoading(false)
        return
      }

      const dirFiles = await readDirectoryFiles(handle)
      setCurrentHandle(handle)
      setDirectoryName(handle.name)
      setFiles(dirFiles)
    } catch {
      setError('De geselecteerde map is niet meer beschikbaar. Selecteer een nieuwe map.')
      await clearDirectoryHandle()
      setHasStoredHandle(false)
      setDirectoryName(null)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  // Bestanden vernieuwen zonder opnieuw te kiezen
  const refreshFiles = useCallback(async () => {
    if (!currentHandle) return

    setError(null)
    setIsLoading(true)

    try {
      const dirFiles = await readDirectoryFiles(currentHandle)
      setFiles(dirFiles)
    } catch {
      setError('Kon de bestanden niet vernieuwen. Probeer het opnieuw.')
    } finally {
      setIsLoading(false)
    }
  }, [currentHandle])

  // Map loskoppelen
  const disconnectDirectory = useCallback(async () => {
    await clearDirectoryHandle()
    setCurrentHandle(null)
    setDirectoryName(null)
    setHasStoredHandle(false)
    setFiles([])
    setError(null)
  }, [])

  return {
    files,
    isLoading,
    error,
    directoryName,
    hasStoredHandle,
    isSupported,
    selectDirectory,
    reconnectDirectory,
    refreshFiles,
    disconnectDirectory,
  }
}
