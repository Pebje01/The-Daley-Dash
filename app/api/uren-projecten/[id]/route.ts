import { NextRequest, NextResponse } from 'next/server'
import { getUurProject, updateUurProject, deleteUurProject } from '@/lib/supabase/uren-projecten'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const project = await getUurProject(id)
  if (!project) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const project = await updateUurProject(id, body)
  return NextResponse.json(project)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteUurProject(id)
  return NextResponse.json({ ok: true })
}
