import { Suspense } from 'react'
import CrmRecordsPage from '@/components/CrmRecordsPage'

export default function CrmOpdrachtenPage() {
  return (
    <Suspense>
      <CrmRecordsPage entity="assignment" />
    </Suspense>
  )
}
