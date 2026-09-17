import { Suspense } from 'react'
import ProspectsPage from '@/components/crm/ProspectsPage'

export default function CrmProspectsPage() {
  return (
    <Suspense>
      <ProspectsPage />
    </Suspense>
  )
}
