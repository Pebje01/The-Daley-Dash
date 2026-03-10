'use client'
import { Suspense } from 'react'
import NieuweOfferteContent from '@/components/offertes/NieuweOfferteContent'

export default function NieuweOffertePage() {
  return (
    <div className="p-8">
      <Suspense fallback={<div className="text-brand-text-secondary">Laden…</div>}>
        <NieuweOfferteContent />
      </Suspense>
    </div>
  )
}
