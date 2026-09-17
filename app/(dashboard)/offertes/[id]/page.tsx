'use client'
import { useParams } from 'next/navigation'
import OfferteDetailContent from '@/components/offertes/OfferteDetailContent'

export default function OfferteDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <OfferteDetailContent id={id} />
    </div>
  )
}
