// Import webextension-polyfill for consistent promise-based APIs
import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'
import type { InsertPromptResponse } from './types.js'
import { MessageAction } from './types.js'
import { execute, extensionName, generateId, getIso, getProjectDisplayName, getStorage, setStorage, truncate } from './utils.js'

async function showNotification(title: string, message: string): Promise<void> {
  try {
    if (!message || message.trim() === '') {
      console.warn('Notification skipped: empty message')
      return
    }

    const { settings } = await getStorage(['settings'])
    if (settings.enableNotifications) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title && title.trim() !== '' ? title : extensionName,
        message: message.trim(),
      })
    }
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

async function insertPromptToTab(tabId: number, content: string): Promise<boolean> {
  try {
    const response: InsertPromptResponse = await browser.tabs.sendMessage(tabId, {
      action: MessageAction.INSERT_PROMPT,
      content,
    })
    return response?.success || false
  } catch (error) {
    console.error('Failed to insert prompt:', error)
    return false
  }
}

browser.runtime.onInstalled.addListener(async () => {
  console.log(`${extensionName} extension installed`)
  initializeContextMenu()
})

browser.runtime.onStartup.addListener(async () => {
  console.log(`${extensionName} extension started`)
  initializeContextMenu()
})

async function initializeContextMenu() {
  try {
    const { settings } = await getStorage(['settings'])
    if (settings.enableContextMenu) {
      await createContextMenu()
    }
  } catch (error) {
    console.error('Failed to initialize context menu:', error)
  }
}

async function createContextMenu() {
  try {
    await browser.contextMenus.removeAll()
    const { prompts, projects, settings } = await getStorage(['prompts', 'projects', 'settings'])
    const recentPrompts = prompts.slice(-5).reverse()

    // Always add "Add New Prompt" menu item
    browser.contextMenus.create({ id: 'add-new-prompt', title: 'Add New Prompt', contexts: ['editable'] })
    if (recentPrompts.length > 0) {
      browser.contextMenus.create({ id: 'add-separator', type: 'separator', contexts: ['editable'] })
    }

    recentPrompts.forEach((prompt: any) => {
      const projectId = prompt.project || 'default'
      const projectName = getProjectDisplayName(projectId, projects, settings)
      const menuTitle = `${projectName} > ${prompt.title}`

      browser.contextMenus.create({
        id: `prompt-${prompt.id}`,
        title: truncate(menuTitle),
        contexts: ['editable'],
      })
    })

    if (recentPrompts.length > 0) {
      browser.contextMenus.create({
        id: 'ai-prompts-separator',
        type: 'separator',
        contexts: ['editable'],
      })
    }

    // Always show "View all prompts" menu item
    browser.contextMenus.create({
      id: 'view-all-prompts',
      title: 'View all prompts...',
      contexts: ['editable'],
    })

    console.log(`Context menu created with ${recentPrompts.length} recent prompts`)
  } catch (error) {
    console.error('Failed to create context menu:', error)
  }
}

browser.contextMenus.onClicked.addListener(async (info: Browser.Menus.OnClickData, tab?: Browser.Tabs.Tab) => {
  if (info.menuItemId === 'add-new-prompt') {
    try {
      if (browser.action?.openPopup) {
        browser.action.openPopup()
        // Send message to popup to open modal with content
        setTimeout(() => {
          browser.runtime.sendMessage({ action: MessageAction.OPEN_ADD_MODAL })
        }, 100)
      } else {
        browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
      }
    } catch (error) {
      // Fallback to opening in a new tab if popup fails (Firefox user gesture requirement)
      browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
    }
    return
  }

  if (info.menuItemId === 'view-all-prompts') {
    try {
      if (browser.action?.openPopup) {
        browser.action.openPopup()
      } else {
        browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
      }
    } catch (error) {
      // Fallback to opening in a new tab if popup fails (Firefox user gesture requirement)
      browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
    }
    return
  }

  if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('prompt-')) {
    const promptId = info.menuItemId.replace('prompt-', '')
    try {
      const { prompts } = await getStorage(['prompts'])
      const prompt = prompts.find((p: any) => p.id === promptId)

      if (prompt && tab?.id) {
        await insertPromptToTab(tab.id, prompt.content)
      }
    } catch (error) {
      console.error('Context menu insertion failed:', error)
    }
  }
})

browser.commands.onCommand.addListener(async (command: string) => {
  if (command === 'insert-last-prompt') {
    try {
      const { prompts } = await getStorage(['prompts'])
      if (prompts.length > 0) {
        const lastPrompt = prompts[prompts.length - 1]
        const tabs = await browser.tabs.query({ active: true, currentWindow: true })

        if (tabs[0]?.id) {
          await insertPromptToTab(tabs[0].id, lastPrompt.content)
        }
      }
    } catch (error) {
      console.error('Keyboard shortcut insertion failed:', error)
    }
  }
})

browser.runtime.onMessage.addListener((request: any, sender: Browser.Runtime.MessageSender, sendResponse: (response?: any) => void): true => {
  if (request.action === MessageAction.GET_PROMPTS) {
    execute(async () => {
      const { prompts } = await getStorage(['prompts'])
      const projectFilter = (request as { project?: string }).project || 'default'
      const filteredPrompts = prompts.filter((prompt: any) =>
        (prompt.project || 'default') === projectFilter,
      )
      sendResponse({ prompts: filteredPrompts })
    })
    return true
  }

  if (request.action === MessageAction.GET_PROJECTS) {
    execute(async () => {
      const { projects } = await getStorage(['projects'])
      sendResponse({ projects })
    })
    return true
  }

  if (request.action === MessageAction.SAVE_PROMPT) {
    execute(async () => {
      const { prompts } = await getStorage(['prompts'])
      const saveRequest = request as unknown as { title: string; content: string; project?: string }

      prompts.push({
        id: generateId(),
        title: saveRequest.title,
        content: saveRequest.content,
        project: saveRequest.project || 'default',
        createdAt: getIso(),
      })

      await setStorage({ prompts })
      createContextMenu()
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === MessageAction.UPDATE_CONTEXT_MENU) {
    execute(async () => {
      if (request.enabled) {
        await createContextMenu()
      } else {
        await browser.contextMenus.removeAll()
      }
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === MessageAction.SHOW_NOTIFICATION) {
    showNotification((request as { title?: string }).title || extensionName, (request as { message?: string }).message || 'Action completed')
    return true
  }

  if (request.action === MessageAction.OPEN_POPUP) {
    // Call openPopup immediately without any async operations to preserve user gesture
    if (browser.action?.openPopup) {
      browser.action.openPopup()
    } else {
      browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
    }
    sendResponse({ success: true })
    return true
  }

  if (request.action === MessageAction.SAVE_PROJECT) {
    execute(async () => {
      const { projects, settings } = await getStorage(['projects', 'settings'])
      const projectRequest = request as unknown as { id?: string; name: string; description?: string }

      if (projectRequest.id === 'default') {
        settings.defaultProjectName = projectRequest.name
        await setStorage({ settings })
        sendResponse({ success: true })
      } else if (projectRequest.id) {
        const index = projects.findIndex((p: any) => p.id === projectRequest.id)
        if (index !== -1) {
          projects[index] = {
            ...projects[index],
            name: projectRequest.name,
            description: projectRequest.description,
          }
        }
        await setStorage({ projects })
        sendResponse({ success: true })
      } else {
        const newProject = {
          id: generateId(),
          name: projectRequest.name,
          description: projectRequest.description || '',
          createdAt: getIso(),
        }
        projects.push(newProject)

        await setStorage({ projects })
        sendResponse({ success: true, project: newProject })
      }
    })
    return true
  }

  if (request.action === MessageAction.UPDATE_PROMPT) {
    execute(async () => {
      const { prompts } = await getStorage(['prompts'])
      const updateRequest = request as unknown as { id: string; title: string; content: string }
      const index = prompts.findIndex((p: any) => p.id === updateRequest.id)

      if (index !== -1) {
        prompts[index] = {
          ...prompts[index],
          title: updateRequest.title,
          content: updateRequest.content,
        }

        await setStorage({ prompts })
        createContextMenu()
        sendResponse({ success: true })
      } else {
        sendResponse({ success: false, error: 'Prompt not found' })
      }
    })
    return true
  }

  if (request.action === MessageAction.DELETE_PROMPT) {
    execute(async () => {
      const { prompts } = await getStorage(['prompts'])
      const deleteRequest = request as unknown as { id: string }
      const filteredPrompts = prompts.filter((p: any) => p.id !== deleteRequest.id)

      await setStorage({ prompts: filteredPrompts })
      createContextMenu()
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === MessageAction.DELETE_PROJECT) {
    execute(async () => {
      const { projects, prompts, settings } = await getStorage(['projects', 'prompts', 'settings'])
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

        await setStorage({ projects: remainingProjects, prompts: updatedPrompts, settings })
        sendResponse({ success: true, newDefaultId: newDefaultProject.id })
      } else {
        const filteredProjects = projects.filter((p) => p.id !== deleteRequest.id)

        // Move prompts from deleted project to default
        const updatedPrompts = prompts.map((prompt) =>
          prompt.project === deleteRequest.id ? { ...prompt, project: 'default' } : prompt,
        )

        await setStorage({ projects: filteredProjects, prompts: updatedPrompts })
        sendResponse({ success: true })
      }
    })
    return true
  }

  return true
})
