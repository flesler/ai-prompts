import browser from 'webextension-polyfill'
import type { ExtensionSettings, MessageAction, Project, Prompt, Storage, StorageGet, StorageKeys, StorageResult } from './types.js'
import { DEFAULT_SETTINGS } from './types.js'

export function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

export function addEvent(id: string, event: string, callback: (event: Event) => void) {
  return getElement<HTMLElement>(id)?.addEventListener(event, callback)
}

export function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = getElement<T>(id)
  if (!element) throw new Error(`Required element not found: ${id}`)
  return element
}

export function truncate(text: string, maxLength: number = 30, suffix: string = '...'): string {
  return text.length > maxLength ? text.substring(0, maxLength) + suffix : text
}

export function sendMessage<T = unknown>(
  action: MessageAction,
  data: Record<string, unknown> = {},
): Promise<T> {
  return browser.runtime.sendMessage({ action, ...data })
}

export function getPromptsFromResult(result: StorageResult): Prompt[] {
  return result?.prompts || []
}

export function getProjectsFromResult(result: StorageResult): Project[] {
  return result?.projects || []
}

export function getSettingsFromResult(result: StorageResult): Partial<ExtensionSettings> {
  return result?.settings || {}
}

export function setInputValue(id: string, value: string | number | boolean) {
  const element = getElement<HTMLInputElement | HTMLSelectElement>(id)
  if (!element) return

  if (element.type === 'checkbox') {
    (element as HTMLInputElement).checked = Boolean(value)
  } else {
    element.value = String(value)
  }
}

export function getInputValue(id: string): string {
  const element = getElement<HTMLInputElement | HTMLSelectElement>(id)
  return element?.value || ''
}

export function getCheckboxValue(id: string): boolean {
  const element = getElement<HTMLInputElement>(id)
  return element?.checked || false
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function generateId(): string {
  return Date.now().toString()
}

export function generateUniqueId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9)
}

export function getIso(): string {
  return new Date().toISOString()
}

export function getToday(): string {
  return getIso().split('T')[0]
}

export function populateSelectOptions(
  selectElement: HTMLSelectElement,
  options: Array<{ value: string; text: string }>,
  defaultOption?: { value: string; text: string },
) {
  selectElement.innerHTML = ''

  if (defaultOption) {
    const option = document.createElement('option')
    option.value = defaultOption.value
    option.textContent = defaultOption.text
    selectElement.appendChild(option)
  }

  options.forEach(({ value, text }) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = text
    selectElement.appendChild(option)
  })
}

export function showUINotification(message: string, type: 'success' | 'error' = 'success') {
  const statusElement = getElement('status')
  if (statusElement) {
    statusElement.textContent = message
    statusElement.className = `status ${type}`
    statusElement.style.display = 'block'

    setTimeout(() => {
      statusElement.style.display = 'none'
    }, 3000)
  }
}

export function confirmAction(message: string): boolean {
  return confirm(message)
}

export function getProjectDisplayName(projectId: string, projects: Project[], settings: Partial<ExtensionSettings>): string {
  if (projectId === 'default') {
    return settings.defaultProjectName || 'Default Project'
  }
  return projects.find(p => p.id === projectId)?.name || 'Unknown Project'
}

export const execute = (fn: () => Promise<void>) => fn()

// Typed storage helpers with proper defaults
const storageDefaults: Storage = {
  prompts: [],
  projects: [],
  settings: DEFAULT_SETTINGS,
  lastSelectedProject: 'default',
}

export async function getStorage<K extends StorageKeys>(keys: K[]): Promise<StorageGet<K> & Partial<Storage>> {
  const result = await browser.storage.sync.get(keys)
  const typedResult = {} as StorageGet<K> & Partial<Storage>

  for (const key of keys) {
    ; (typedResult as any)[key] = result[key] ?? storageDefaults[key]
  }

  return typedResult
}

export async function setStorage<K extends StorageKeys>(data: Partial<Pick<Storage, K>>): Promise<void> {
  return browser.storage.sync.set(data)
}
