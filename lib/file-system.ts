// File System Access API utilities
// Biedt toegang tot lokale mappen via de browser File System Access API
// en slaat directory handles op in IndexedDB voor hergebruik

const DB_NAME = 'daley-dash-fs'
const DB_VERSION = 1
const STORE_NAME = 'handles'
const HANDLE_KEY = 'directory'

export interface LocalFile {
  name: string
  size: number
  type: string
  lastModified: number
  path: string
}

// Check of de File System Access API beschikbaar is
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// Open een map-picker dialoog
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    return handle
  } catch {
    // Gebruiker heeft geannuleerd of er is een fout opgetreden
    return null
  }
}

// Lees alle bestanden uit een directory (1 niveau diep)
export async function readDirectoryFiles(
  handle: FileSystemDirectoryHandle
): Promise<LocalFile[]> {
  const files: LocalFile[] = []

  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      files.push({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        path: `${handle.name}/${file.name}`,
      })
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name))
}

// --- IndexedDB helpers voor het opslaan van directory handles ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Sla een directory handle op in IndexedDB
export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(handle, HANDLE_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Laad een eerder opgeslagen directory handle uit IndexedDB
export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(HANDLE_KEY)

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

// Verwijder de opgeslagen directory handle uit IndexedDB
export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(HANDLE_KEY)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Negeer fouten bij opruimen
  }
}
