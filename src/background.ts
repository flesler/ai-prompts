import { InsertPromptResponse, MessageAction, StorageResult } from './types.js'
import { generateId, getCurrentISOString, truncate } from './utils.js'

// Local Chrome API utilities for background script
function promisify<TResult, TArgs extends any[]>(
  fn: (...args: [...TArgs, (result: TResult) => void]) => void,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => new Promise((resolve) => {
    fn(...args, resolve)
  })
}

const getChromeStorage = promisify<StorageResult, [string[]]>(chrome.storage.sync.get.bind(chrome.storage.sync))
const setChromeStorage = promisify<void, [Partial<StorageResult>]>(chrome.storage.sync.set.bind(chrome.storage.sync))
const sendTabMessage = promisify<any, [number, any]>(chrome.tabs.sendMessage.bind(chrome.tabs))
const removeAllContextMenus = promisify<void, []>(chrome.contextMenus.removeAll.bind(chrome.contextMenus))
const queryTabs = promisify<chrome.tabs.Tab[], [chrome.tabs.QueryInfo]>(chrome.tabs.query.bind(chrome.tabs))

async function showNotification(title: string, message: string): Promise<void> {
  try {
    if (!message || message.trim() === '') {
      console.warn('Notification skipped: empty message')
      return
    }

    const result = await getChromeStorage(['settings'])
    const settings = result.settings || {}
    if (settings.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title && title.trim() !== '' ? title : 'AI Prompts',
        message: message.trim(),
      })
    }
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

async function insertPromptToTab(tabId: number, content: string): Promise<boolean> {
  try {
    const response: InsertPromptResponse = await sendTabMessage(tabId, {
      action: MessageAction.INSERT_PROMPT,
      content,
    })
    return response?.success || false
  } catch (error) {
    console.error('Failed to insert prompt:', error)
    return false
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('AI Prompts extension installed')

  const result = await getChromeStorage(['settings'])
  const settings = result.settings || { enableContextMenu: true }
  if (settings.enableContextMenu) {
    createContextMenu()
  }
})

async function createContextMenu() {
  await removeAllContextMenus()
  const result = await getChromeStorage(['prompts'])
  const prompts = result.prompts || []
  const recentPrompts = prompts.slice(-5).reverse()

  recentPrompts.forEach((prompt) => {
    chrome.contextMenus.create({
      id: `prompt-${prompt.id}`,
      title: truncate(prompt.title),
      contexts: ['editable'],
    })
  })

  if (recentPrompts.length > 0) {
    chrome.contextMenus.create({
      id: 'ai-prompts-separator',
      type: 'separator',
      contexts: ['editable'],
    })

    chrome.contextMenus.create({
      id: 'view-all-prompts',
      title: 'View all prompts...',
      contexts: ['editable'],
    })
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'view-all-prompts') {
    if (chrome.action?.openPopup) {
      chrome.action.openPopup()
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })
    }
    return
  }

  if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('prompt-')) {
    const promptId = info.menuItemId.replace('prompt-', '')
    try {
      const result = await getChromeStorage(['prompts'])
      const prompts = result.prompts || []
      const prompt = prompts.find((p) => p.id === promptId)

      if (prompt && tab?.id) {
        const success = await insertPromptToTab(tab.id, prompt.content)
        if (success) {
          await showNotification('AI Prompts', `Inserted prompt: ${prompt.title}`)
        }
      }
    } catch (error) {
      console.error('Context menu insertion failed:', error)
    }
  }
})

chrome.commands.onCommand.addListener(async (command: string) => {
  if (command === 'insert-last-prompt') {
    try {
      const result = await getChromeStorage(['prompts'])
      const prompts = result.prompts || []
      if (prompts.length > 0) {
        const lastPrompt = prompts[prompts.length - 1]

        const tabs = await queryTabs({ active: true, currentWindow: true })

        if (tabs[0]?.id) {
          const success = await insertPromptToTab(tabs[0].id, lastPrompt.content)
          if (success) {
            await showNotification('AI Prompts', `Inserted: ${lastPrompt.title}`)
          }
        }
      }
    } catch (error) {
      console.error('Keyboard shortcut insertion failed:', error)
    }
  }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === MessageAction.GET_PROMPTS) {
    ;(async () => {
      const result = await getChromeStorage(['prompts'])
      const allPrompts = result.prompts || []
      const projectFilter = (request as { project?: string }).project || 'default'
      const filteredPrompts = allPrompts.filter((prompt) =>
        (prompt.project || 'default') === projectFilter,
      )
      sendResponse({ prompts: filteredPrompts })
    })()
    return true
  }

  if (request.action === MessageAction.GET_PROJECTS) {
    ;(async () => {
      const result = await getChromeStorage(['projects'])
      sendResponse({ projects: result.projects || [] })
    })()
    return true
  }

  if (request.action === MessageAction.SAVE_PROMPT) {
    ;(async () => {
      const result = await getChromeStorage(['prompts'])
      const prompts = result.prompts || []
      const saveRequest = request as unknown as { title: string; content: string; project?: string }

      prompts.push({
        id: Date.now().toString(),
        title: saveRequest.title,
        content: saveRequest.content,
        project: saveRequest.project || 'default',
        createdAt: new Date().toISOString(),
      })

      await setChromeStorage({ prompts })
      createContextMenu()
      sendResponse({ success: true })
    })()
    return true
  }

  if (request.action === MessageAction.UPDATE_CONTEXT_MENU) {
    if (request.enabled) {
      createContextMenu()
    } else {
      removeAllContextMenus().then(() => sendResponse({ success: true }))
    }
    return true
  }

  if (request.action === MessageAction.SHOW_NOTIFICATION) {
    showNotification((request as { title?: string }).title || 'AI Prompts', (request as { message?: string }).message || 'Action completed')
    return true
  }

  if ((request as { action: string }).action === 'openPopup') {
    if (chrome.action?.openPopup) {
      chrome.action.openPopup()
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })
    }
    sendResponse({ success: true })
    return true
  }

  if (request.action === MessageAction.SAVE_PROJECT) {
    ;(async () => {
      const result = await getChromeStorage(['projects', 'settings'])
      const projects = result.projects || []
      const settings = result.settings || {}
      const projectRequest = request as unknown as { id?: string; name: string; description?: string }

      if (projectRequest.id === 'default') {
        settings.defaultProjectName = projectRequest.name
        await setChromeStorage({ settings })
        sendResponse({ success: true })
      } else if (projectRequest.id) {
        const index = projects.findIndex((p) => p.id === projectRequest.id)
        if (index !== -1) {
          projects[index] = {
            ...projects[index],
            name: projectRequest.name,
            description: projectRequest.description,
          }
        }
        await setChromeStorage({ projects })
        sendResponse({ success: true })
      } else {
        const newProject = {
          id: generateId(),
          name: projectRequest.name,
          description: projectRequest.description || '',
          createdAt: getCurrentISOString(),
        }
        projects.push(newProject)

        await setChromeStorage({ projects })
        sendResponse({ success: true, project: newProject })
      }
    })()
    return true
  }

  if (request.action === MessageAction.UPDATE_PROMPT) {
    ;(async () => {
      const result = await getChromeStorage(['prompts'])
      const prompts = result.prompts || []
      const updateRequest = request as unknown as { id: string; title: string; content: string }
      const index = prompts.findIndex((p) => p.id === updateRequest.id)

      if (index !== -1) {
        prompts[index] = {
          ...prompts[index],
          title: updateRequest.title,
          content: updateRequest.content,
        }

        await setChromeStorage({ prompts })
        createContextMenu()
        sendResponse({ success: true })
      } else {
        sendResponse({ success: false, error: 'Prompt not found' })
      }
    })()
    return true
  }

  if (request.action === MessageAction.DELETE_PROMPT) {
    ;(async () => {
      const result = await getChromeStorage(['prompts'])
      const prompts = result.prompts || []
      const deleteRequest = request as unknown as { id: string }
      const filteredPrompts = prompts.filter((p) => p.id !== deleteRequest.id)

      await setChromeStorage({ prompts: filteredPrompts })
      createContextMenu()
      sendResponse({ success: true })
    })()
    return true
  }

  if (request.action === MessageAction.DELETE_PROJECT) {
    ;(async () => {
      const result = await getChromeStorage(['projects', 'prompts', 'settings'])
      const projects = result.projects || []
      const prompts = result.prompts || []
      const settings = result.settings || {}
      const deleteRequest = request as unknown as { id: string }

      if (deleteRequest.id === 'default') {
        if (projects.length === 0) {
          sendResponse({ success: false, error: 'Cannot delete the last project' })
          return
        }

        // Promote the first project to be the new "default"
        const newDefaultProject = projects[0]
        const remainingProjects = projects.slice(1)

        // Move all default project prompts to the new default
        const updatedPrompts = prompts.map((prompt) =>
          prompt.project === 'default' ? { ...prompt, project: newDefaultProject.id } : prompt,
        )

        delete settings.defaultProjectName

        await setChromeStorage({ projects: remainingProjects, prompts: updatedPrompts, settings })
        sendResponse({ success: true, newDefaultId: newDefaultProject.id })
      } else {
        const filteredProjects = projects.filter((p) => p.id !== deleteRequest.id)

        // Move prompts from deleted project to default
        const updatedPrompts = prompts.map((prompt) =>
          prompt.project === deleteRequest.id ? { ...prompt, project: 'default' } : prompt,
        )

        await setChromeStorage({ projects: filteredProjects, prompts: updatedPrompts })
        sendResponse({ success: true })
      }
    })()
    return true
  }

  return false
})
