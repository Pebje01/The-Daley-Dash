import { Suspense } from 'react'
import CrmRecordsPage from '@/components/CrmRecordsPage'

export default function CrmLeadsPage() {
  return (
    <Suspense>
      <CrmRecordsPage entity="lead" />
    </Suspense>
  )
}
