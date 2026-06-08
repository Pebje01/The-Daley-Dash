import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmOpdrachtenPage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="assignment" />
    </Suspense>
  )
}
