import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmContactenPage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="contact" />
    </Suspense>
  )
}
