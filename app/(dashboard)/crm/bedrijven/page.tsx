import { Suspense } from 'react'
import CrmRecordsPage from '@/components/CrmRecordsPage'

export default function CrmBedrijvenPage() {
  return (
    <Suspense>
      <CrmRecordsPage entity="company" />
    </Suspense>
  )
}
