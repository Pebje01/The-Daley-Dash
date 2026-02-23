export type ClickUpCrmEntityType = 'daley_list' | 'lead' | 'company' | 'contact' | 'assignment' | 'clickup_invoice'

export interface ClickUpCrmListConfig {
  entityType: ClickUpCrmEntityType
  listId: string
}

export interface ClickUpConfig {
  apiKey: string
  apiBaseUrl: string
  webhookSecret?: string
  lists: ClickUpCrmListConfig[]
}

export function getClickUpConfig(): ClickUpConfig {
  const apiKey = process.env.CLICKUP_API_KEY
  if (!apiKey) throw new Error('Missing CLICKUP_API_KEY')

  const lists: ClickUpCrmListConfig[] = [
    { entityType: 'daley_list', listId: process.env.CLICKUP_DALEY_LIST_ID || '' },
    { entityType: 'lead', listId: process.env.CLICKUP_LEADS_LIST_ID || '' },
    { entityType: 'company', listId: process.env.CLICKUP_COMPANIES_LIST_ID || '' },
    { entityType: 'contact', listId: process.env.CLICKUP_CONTACTS_LIST_ID || '' },
    { entityType: 'assignment', listId: process.env.CLICKUP_ASSIGNMENTS_LIST_ID || '' },
    { entityType: 'clickup_invoice', listId: process.env.CLICKUP_INVOICES_LIST_ID || '' },
  ] satisfies ClickUpCrmListConfig[]

  const configuredLists = lists.filter((l) => l.listId)

  if (configuredLists.length === 0) {
    throw new Error(
      'Missing ClickUp list IDs. Set CLICKUP_LEADS_LIST_ID / CLICKUP_COMPANIES_LIST_ID / CLICKUP_CONTACTS_LIST_ID'
    )
  }

  return {
    apiKey,
    apiBaseUrl: process.env.CLICKUP_API_BASE_URL || 'https://api.clickup.com/api/v2',
    webhookSecret: process.env.CLICKUP_WEBHOOK_SECRET || undefined,
    lists: configuredLists,
  }
}
