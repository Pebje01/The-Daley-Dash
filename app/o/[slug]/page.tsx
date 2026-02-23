import { permanentRedirect, notFound } from 'next/navigation'

export default function LegacyOfferteRedirectPage({
  params,
}: {
  params: { slug: string }
}) {
  if (!params?.slug) notFound()
  permanentRedirect(`/offerte/${encodeURIComponent(params.slug)}`)
}

