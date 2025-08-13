import { DEFAULT_SETTINGS, ExtensionSettings, MessageAction, Prompt } from './types.js'
import { addEvent, generateUniqueId, getCheckboxValue, getIso, getProjectDisplayName, getProjectsFromResult, getPromptsFromResult, getSettingsFromResult, getToday, setInputValue, showUINotification } from './utils.js'

document.addEventListener('DOMContentLoaded', () => {
  loadSettings()

  addEvent('enableNotifications', 'change', saveSettings)
  addEvent('enableContextMenu', 'change', saveSettings)

  addEvent('exportBtn', 'click', exportPrompts)

  addEvent('importBtn', 'click', () => {
    document.getElementById('importFile')?.click()
  })

  addEvent('importFile', 'change', importPrompts)
})

function loadSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...getSettingsFromResult(result) }

    setInputValue('enableNotifications', settings.enableNotifications)
    setInputValue('enableContextMenu', settings.enableContextMenu)
  })
}

function saveSettings() {
  const settings: ExtensionSettings = {
    enableNotifications: getCheckboxValue('enableNotifications'),
    enableContextMenu: getCheckboxValue('enableContextMenu'),
  }

  chrome.storage.sync.set({ settings }, () => {
    chrome.runtime.sendMessage({ action: MessageAction.UPDATE_CONTEXT_MENU, enabled: settings.enableContextMenu })
  })
}

function exportPrompts() {
  chrome.storage.sync.get(['prompts', 'projects', 'settings'], (result) => {
    const prompts = getPromptsFromResult(result)
    const projects = getProjectsFromResult(result)
    const settings = getSettingsFromResult(result)

    let csvContent = 'Project,Title,Content\n'
    prompts.forEach(prompt => {
      const projectName = getProjectDisplayName(prompt.project || 'default', projects, settings)

      const title = escapeCSV(prompt.title || '')
      const content = escapeCSV(prompt.content || '')
      const project = escapeCSV(projectName)

      csvContent += `${project},${title},${content}\n`
    })

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-prompts_${getToday()}.csv`
    a.click()
    URL.revokeObjectURL(url)

    showUINotification('Prompts exported to CSV successfully!', 'success')
  })
}

function escapeCSV(text: string): string {
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function importPrompts(event: Event) {
  const file = (event.target as HTMLInputElement)?.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string

    try {
      const prompts = parseCSV(content)
      if (prompts.length > 0) {
        chrome.storage.sync.get(['prompts'], (result) => {
          const existingPrompts = getPromptsFromResult(result)
          const allPrompts = [...existingPrompts, ...prompts]

          chrome.storage.sync.set({ prompts: allPrompts }, () => {
            showUINotification(`Imported ${prompts.length} prompts from CSV successfully!`, 'success')
          })
        })
      } else {
        showUINotification('No valid prompts found in CSV file.', 'error')
      }
    } catch (csvError) {
      showUINotification('Error importing CSV file. Please check the format.', 'error')
    }
  }
  reader.readAsText(file)
}

function parseCSV(csvContent: string): Prompt[] {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const dataLines = lines.slice(1)
  const prompts: Prompt[] = []

  dataLines.forEach(line => {
    const fields = parseCSVLine(line)
    if (fields.length >= 3) {
      prompts.push({
        id: generateUniqueId(),
        title: fields[1] || 'Imported Prompt',
        content: fields[2] || '',
        project: fields[0] || 'default',
        createdAt: getIso(),
      })
    }
  })

  return prompts
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentField += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField)
      currentField = ''
      i++
    } else {
      currentField += char
      i++
    }
  }

  fields.push(currentField)
  return fields
}

