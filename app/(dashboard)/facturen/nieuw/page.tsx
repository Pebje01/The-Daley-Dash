'use client'
import { Suspense } from 'react'
import NieuweFactuurContent from '@/components/facturen/NieuweFactuurContent'

export default function NieuweFactuurPage() {
  return (
    <div className="p-8">
      <Suspense fallback={<div className="text-brand-text-secondary">Laden...</div>}>
        <NieuweFactuurContent />
      </Suspense>
    </div>
  )
}
