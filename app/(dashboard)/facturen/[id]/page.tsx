'use client'
import { useParams } from 'next/navigation'
import FactuurDetailContent from '@/components/facturen/FactuurDetailContent'

export default function FactuurDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="p-8">
      <FactuurDetailContent id={id} />
    </div>
  )
}
