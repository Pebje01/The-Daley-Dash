'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import SlideOverPanel from '@/components/SlideOverPanel'
import DrawerSkeleton from '@/components/DrawerSkeleton'
import { useDrawer } from '@/components/DrawerContext'
import { dataChanged } from '@/lib/events'

// Lazy-load content componenten voor snellere initiële load
const OfferteDetailContent = dynamic(
  () => import('@/components/offertes/OfferteDetailContent'),
  { loading: () => <DrawerSkeleton /> }
)

const FactuurDetailContent = dynamic(
  () => import('@/components/facturen/FactuurDetailContent'),
  { loading: () => <DrawerSkeleton /> }
)

const NieuweOfferteContent = dynamic(
  () => import('@/components/offertes/NieuweOfferteContent'),
  { loading: () => <DrawerSkeleton /> }
)

const NieuweFactuurContent = dynamic(
  () => import('@/components/facturen/NieuweFactuurContent'),
  { loading: () => <DrawerSkeleton /> }
)

// Titels per drawer type
function drawerTitle(type: string | null): string {
  switch (type) {
    case 'offerte-detail': return 'Offerte'
    case 'factuur-detail': return 'Factuur'
    case 'offerte-nieuw': return 'Nieuwe offerte'
    case 'factuur-nieuw': return 'Nieuwe factuur'
    default: return ''
  }
}

export default function DrawerHost() {
  const { drawerState, closeDrawer, isOpen, openDrawer } = useDrawer()

  // Na aanmaken: open de detail-drawer voor het nieuwe item
  const handleOfferteCreated = (id: string) => {
    dataChanged('offertes')
    openDrawer({ type: 'offerte-detail', id })
  }

  const handleFactuurCreated = (id: string) => {
    dataChanged('facturen')
    openDrawer({ type: 'factuur-detail', id })
  }

  return (
    <SlideOverPanel
      open={isOpen}
      onClose={closeDrawer}
      title={drawerTitle(drawerState.type)}
    >
      <Suspense fallback={<DrawerSkeleton />}>
        {drawerState.type === 'offerte-detail' && drawerState.id && (
          <OfferteDetailContent
            id={drawerState.id}
            onClose={closeDrawer}
            isDrawer
          />
        )}

        {drawerState.type === 'factuur-detail' && drawerState.id && (
          <FactuurDetailContent
            id={drawerState.id}
            onClose={closeDrawer}
            isDrawer
          />
        )}

        {drawerState.type === 'offerte-nieuw' && (
          <NieuweOfferteContent
            onClose={closeDrawer}
            onCreated={handleOfferteCreated}
            isDrawer
          />
        )}

        {drawerState.type === 'factuur-nieuw' && (
          <NieuweFactuurContent
            onClose={closeDrawer}
            onCreated={handleFactuurCreated}
            isDrawer
          />
        )}
      </Suspense>
    </SlideOverPanel>
  )
}
