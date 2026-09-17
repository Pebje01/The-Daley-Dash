import { Suspense } from 'react'
import CrmRecordsPage from '@/components/CrmRecordsPage'

export default function CrmContactenPage() {
  return (
    <Suspense>
      <CrmRecordsPage entity="contact" />
    </Suspense>
  )
}
