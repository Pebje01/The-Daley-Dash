'use client'

// File System Access API types (not yet in standard TypeScript lib)
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite'
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
    }): Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemDirectoryHandle {
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
    values(): AsyncIterable<FileSystemHandle>
    queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  }
  interface FileSystemFileHandle {
    createWritable(): Promise<WritableStreamDefaultWriter | any>
  }
}

const DB_NAME = 'daley-admin'
const STORE_NAME = 'settings'
const FOLDER_KEY = 'offerte-folder'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Get the stored directory handle (or null if not set) */
export async function getOfferteFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(FOLDER_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/** Store a directory handle */
export async function setOfferteFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(handle, FOLDER_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Ask the user to pick a folder */
export async function pickOfferteFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    })
    await setOfferteFolder(handle)
    return handle
  } catch {
    // User cancelled
    return null
  }
}

function getCurrentPeriod() {
  const now = new Date()
  const year = String(now.getFullYear())
  const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`
  return { year, quarter }
}

function parseYearFromName(name: string): string | null {
  const match = name.match(/\b(20\d{2})\b/)
  return match ? match[1] : null
}

function parseQuarterFromName(name: string): string | null {
  const upper = name.toUpperCase()
  if (/\bQ[1-4]\b/.test(upper)) return upper.match(/\bQ[1-4]\b/)?.[0] ?? null

  const kwartaal = upper.match(/\b(?:KWARTAAL|K)\s*([1-4])\b/)
  if (kwartaal) return `Q${kwartaal[1]}`

  const quarter = upper.match(/\bQUARTER\s*([1-4])\b/)
  if (quarter) return `Q${quarter[1]}`

  return null
}

async function listDirectoryEntries(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = []
  try {
    for await (const entry of dirHandle.values()) {
      entries.push(entry)
    }
  } catch {
    // Ignore and let caller fallback to base folder
  }
  return entries
}

async function resolveTargetDirectory(baseDir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  const { year, quarter } = getCurrentPeriod()
  const entries = await listDirectoryEntries(baseDir)
  if (entries.length === 0) {
    // Browser File System Access API kan mappen niet hernoemen; gebruik de gekozen map direct.
    return baseDir
  }

  const subdirs = entries.filter((e) => e.kind === 'directory') as FileSystemDirectoryHandle[]
  if (subdirs.length === 0) return baseDir

  const yearDirs = subdirs
    .map((d) => ({ dir: d, parsedYear: parseYearFromName(d.name) }))
    .filter((x): x is { dir: FileSystemDirectoryHandle; parsedYear: string } => Boolean(x.parsedYear))

  if (yearDirs.length > 0) {
    let yearDir = yearDirs.find((x) => x.parsedYear === year)?.dir
    if (!yearDir) {
      // Jaarstructuur gevonden maar huidig jaar nog niet: maak standaard jaarmap aan.
      yearDir = await baseDir.getDirectoryHandle(year, { create: true })
    }

    const yearEntries = await listDirectoryEntries(yearDir)
    const yearSubdirs = yearEntries.filter((e) => e.kind === 'directory') as FileSystemDirectoryHandle[]
    const quarterDirs = yearSubdirs
      .map((d) => ({ dir: d, parsedQuarter: parseQuarterFromName(d.name) }))
      .filter((x): x is { dir: FileSystemDirectoryHandle; parsedQuarter: string } => Boolean(x.parsedQuarter))

    if (quarterDirs.length > 0) {
      const existingQuarter = quarterDirs.find((x) => x.parsedQuarter === quarter)?.dir
      return existingQuarter ?? yearDir.getDirectoryHandle(quarter, { create: true })
    }

    return yearDir
  }

  const quarterDirs = subdirs
    .map((d) => ({ dir: d, parsedQuarter: parseQuarterFromName(d.name) }))
    .filter((x): x is { dir: FileSystemDirectoryHandle; parsedQuarter: string } => Boolean(x.parsedQuarter))

  if (quarterDirs.length > 0) {
    const existingQuarter = quarterDirs.find((x) => x.parsedQuarter === quarter)?.dir
    return existingQuarter ?? baseDir.getDirectoryHandle(quarter, { create: true })
  }

  return baseDir
}

/** Save a PDF blob to the offerte folder. Returns true if saved to folder, false if fallback download. */
export async function savePdfToFolder(blob: Blob, filename: string): Promise<boolean> {
  let dirHandle = await getOfferteFolder()

  // Verify we still have permission
  if (dirHandle) {
    try {
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        const requested = await dirHandle.requestPermission({ mode: 'readwrite' })
        if (requested !== 'granted') dirHandle = null
      }
    } catch {
      dirHandle = null
    }
  }

  // If no folder, ask user to pick one
  if (!dirHandle) {
    dirHandle = await pickOfferteFolder()
  }

  if (!dirHandle) return false

  try {
    const targetDir = await resolveTargetDirectory(dirHandle)
    const fileHandle = await targetDir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch {
    return false
  }
}
