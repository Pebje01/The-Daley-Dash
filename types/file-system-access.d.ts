// Type declarations voor de File System Access API
// Deze API is beschikbaar in Chromium browsers maar nog niet in de standaard TS lib

interface FileSystemDirectoryHandle {
  readonly kind: 'directory'
  readonly name: string
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface FileSystemFileHandle {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite'
  }): Promise<FileSystemDirectoryHandle>
}
