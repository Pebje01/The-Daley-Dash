'use client'

import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { X, Check, MoreHorizontal, Trash2 } from 'lucide-react'

// ── Kleuren (overgenomen Notion-palet, light mode) ────────────────────
export const DASH_TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  gray:   { bg: '#e9e9e7', fg: '#4b4a45' },
  brown:  { bg: '#eee0da', fg: '#64473a' },
  orange: { bg: '#fbecdd', fg: '#8a4d24' },
  yellow: { bg: '#fbf3db', fg: '#785e1c' },
  green:  { bg: '#dbeddb', fg: '#2f5e3a' },
  blue:   { bg: '#d8e7f3', fg: '#28557f' },
  purple: { bg: '#eae0f3', fg: '#5f3d99' },
  pink:   { bg: '#f7e0ec', fg: '#943d6f' },
  red:    { bg: '#fbe4e2', fg: '#9e342c' },
}
export const DASH_TAG_KLEURNAMEN = Object.keys(DASH_TAG_COLORS)

function tagStyle(kleur?: string) {
  return DASH_TAG_COLORS[kleur || 'gray'] || DASH_TAG_COLORS.gray
}

export interface DashTag {
  id: string
  naam: string
  kleur: string
  sort_order?: number
}

// ── Context: catalogus + acties, gedeeld via de pagina ────────────────
interface DashTagsCtx {
  catalog: DashTag[]
  /** Maak een nieuwe tag aan; geeft de tag terug (of null bij fout). */
  createTag: (naam: string, kleur?: string) => Promise<DashTag | null>
  /** Zet de tags van een record (optimistisch + persistent). */
  setRecordTags: (recordId: string, tagIds: string[]) => void
  /** Werk een tag bij in de catalogus (kleur/naam). */
  updateTag: (id: string, patch: { naam?: string; kleur?: string }) => void
  /** Verwijder een tag uit de catalogus (en uit alle records). */
  deleteTag: (id: string) => void
}

const DashTagsContext = createContext<DashTagsCtx | null>(null)
export function DashTagsProvider({ value, children }: { value: DashTagsCtx; children: React.ReactNode }) {
  return <DashTagsContext.Provider value={value}>{children}</DashTagsContext.Provider>
}
export function useDashTags() {
  return useContext(DashTagsContext)
}

// ── Losse pill ────────────────────────────────────────────────────────
export function TagBadge({ tag, onRemove }: { tag: DashTag; onRemove?: () => void }) {
  const s = tagStyle(tag.kleur)
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium max-w-full"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="truncate">{tag.naam}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="shrink-0 -mr-0.5 opacity-50 hover:opacity-100 transition-opacity"
          aria-label={`${tag.naam} verwijderen`}
        >
          <X size={11} />
        </button>
      )}
    </span>
  )
}

// ── Inline tags-cel met Notion-stijl popover ──────────────────────────
export function InlineTags({
  record,
  variant = 'cell',
}: {
  record: { id: string; dash_tags?: string[] }
  variant?: 'cell' | 'block'
}) {
  const ctx = useDashTags()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(record.dash_tags ?? [])
  const triggerRef = useRef<HTMLDivElement>(null)

  // Re-init bij wisselen van record.
  useEffect(() => { setSelected(record.dash_tags ?? []) }, [record.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx) return null
  const byId = new Map(ctx.catalog.map((t) => [t.id, t]))
  const selectedTags = selected.map((id) => byId.get(id)).filter(Boolean) as DashTag[]

  const commit = (next: string[]) => {
    setSelected(next)
    ctx.setRecordTags(record.id, next)
  }
  const toggle = (id: string) =>
    commit(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const create = async (naam: string) => {
    const t = await ctx.createTag(naam)
    if (t) commit([...selected.filter((x) => x !== t.id), t.id])
  }

  const isEmpty = selectedTags.length === 0

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={
          variant === 'cell'
            ? 'flex gap-1 flex-wrap items-center min-h-[24px] cursor-pointer -mx-1 px-1 py-0.5 rounded hover:bg-black/[0.03]'
            : 'flex gap-1.5 flex-wrap items-center min-h-[32px] cursor-pointer rounded-lg border border-dashed border-gray-200 hover:border-gray-300 px-2 py-1.5 transition-colors'
        }
      >
        {isEmpty ? (
          <span className="text-xs text-gray-300">{variant === 'block' ? '+ Tags toevoegen' : '+'}</span>
        ) : (
          selectedTags.slice(0, variant === 'cell' ? 3 : 99).map((t) => <TagBadge key={t.id} tag={t} />)
        )}
        {variant === 'cell' && selectedTags.length > 3 && (
          <span className="text-[10px] text-gray-400">+{selectedTags.length - 3}</span>
        )}
      </div>

      {open && (
        <TagPopover
          anchorRef={triggerRef}
          catalog={ctx.catalog}
          selected={selected}
          onToggle={toggle}
          onCreate={create}
          onRecolor={(id, kleur) => ctx.updateTag(id, { kleur })}
          onDelete={(id) => { ctx.deleteTag(id); setSelected((prev) => prev.filter((x) => x !== id)) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── Popover (portal, Notion-stijl) ────────────────────────────────────
function TagPopover({
  anchorRef,
  catalog,
  selected,
  onToggle,
  onCreate,
  onRecolor,
  onDelete,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement>
  catalog: DashTag[]
  selected: string[]
  onToggle: (id: string) => void
  onCreate: (naam: string) => void
  onRecolor: (id: string, kleur: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  // Positioneer onder de trigger.
  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.max(r.width, 240)
    const left = Math.min(r.left, window.innerWidth - width - 12)
    setPos({ left: Math.max(8, left), top: r.bottom + 4, width })
  }, [anchorRef])

  // Sluiten bij buitenklik / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchorRef, onClose])

  const q = query.trim().toLowerCase()
  const gefilterd = q ? catalog.filter((t) => t.naam.toLowerCase().includes(q)) : catalog
  const exact = catalog.some((t) => t.naam.toLowerCase() === q)
  const selectedTags = selected.map((id) => catalog.find((t) => t.id === id)).filter(Boolean) as DashTag[]

  const handleCreate = () => {
    const naam = query.trim()
    if (!naam || exact) return
    onCreate(naam)
    setQuery('')
  }

  if (!pos) return null

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[100] bg-white rounded-lg shadow-xl border border-gray-200 text-sm"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Zoek/invoer met geselecteerde chips */}
      <div className="p-2 border-b border-gray-100">
        <div className="flex flex-wrap gap-1 items-center bg-gray-50 rounded-md px-1.5 py-1">
          {selectedTags.map((t) => (
            <TagBadge key={t.id} tag={t} onRemove={() => onToggle(t.id)} />
          ))}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
              if (e.key === 'Backspace' && !query && selectedTags.length) onToggle(selectedTags[selectedTags.length - 1].id)
            }}
            placeholder={selectedTags.length ? '' : 'Zoek of maak een tag…'}
            className="flex-1 min-w-[60px] bg-transparent outline-none text-xs py-0.5 px-1"
          />
        </div>
      </div>

      {/* Optielijst */}
      <div className="max-h-64 overflow-y-auto py-1">
        <p className="px-3 py-1 text-[11px] text-gray-400">Selecteer een optie of maak er een</p>
        {gefilterd.map((t) => {
          const s = tagStyle(t.kleur)
          const isSel = selected.includes(t.id)
          return (
            <div
              key={t.id}
              className="group flex items-center gap-2 px-2 py-1 mx-1 rounded hover:bg-gray-100 cursor-pointer"
              onClick={() => onToggle(t.id)}
            >
              <span className="w-4 shrink-0 flex justify-center">
                {isSel && <Check size={13} className="text-gray-500" />}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded font-medium truncate"
                style={{ background: s.bg, color: s.fg }}
              >
                {t.naam}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id) }}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-400"
                aria-label="Tag-opties"
              >
                <MoreHorizontal size={14} />
              </button>

              {menuFor === t.id && (
                <div
                  className="absolute right-2 mt-1 z-[101] bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-44"
                  style={{ top: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[11px] text-gray-400 px-1 pb-1">Kleur</p>
                  <div className="grid grid-cols-9 gap-1 mb-2">
                    {DASH_TAG_KLEURNAMEN.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { onRecolor(t.id, k); setMenuFor(null) }}
                        className={`w-4 h-4 rounded-full border ${t.kleur === k ? 'ring-2 ring-offset-1 ring-gray-400' : 'border-black/10'}`}
                        style={{ background: DASH_TAG_COLORS[k].bg }}
                        title={k}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Tag "${t.naam}" overal verwijderen?`)) { onDelete(t.id); setMenuFor(null) } }}
                    className="w-full flex items-center gap-2 px-1.5 py-1 rounded text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Verwijderen
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* Nieuwe tag aanmaken */}
        {q && !exact && (
          <button
            type="button"
            onClick={handleCreate}
            className="w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded hover:bg-gray-100 text-xs text-gray-600"
          >
            Maken
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: DASH_TAG_COLORS.gray.bg, color: DASH_TAG_COLORS.gray.fg }}
            >
              {query.trim()}
            </span>
          </button>
        )}

        {gefilterd.length === 0 && !q && (
          <p className="px-3 py-2 text-xs text-gray-300">Nog geen tags.</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
