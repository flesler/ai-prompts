import type { ExtensionSettings, MessageResponse, Project, ProjectsResponse, Prompt, PromptsResponse, SaveProjectResponse, StorageResult } from './types.js'
import { MessageAction } from './types.js'
import { addEvent, confirmAction, escapeHtml, getElement, getProjectDisplayName, getRequiredElement, populateSelectOptions, truncate } from './utils.js'

// Local Chrome API utilities for popup script
function promisify<TResult, TArgs extends any[]>(
  fn: (...args: [...TArgs, (result: TResult) => void]) => void,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => new Promise((resolve) => {
    fn(...args, resolve)
  })
}

const getChromeStorage = promisify<StorageResult, [string[]]>(chrome.storage.sync.get.bind(chrome.storage.sync))

function sendMessage<T = unknown>(
  action: MessageAction,
  data: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, resolve)
  })
}

let currentProject = 'default'
let editingPromptId: string | null = null

document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedProject()
  loadProjects()
  loadPrompts()
  setupModalHandlers()
  setupProjectEventHandlers()

  addEvent('addPrompt', 'click', () => {
    showEditModal()
  })

  const projectSelect = document.getElementById('projectSelect')
  if (projectSelect) {
    projectSelect.addEventListener('change', (e) => {
      currentProject = (e.target as HTMLSelectElement).value
      chrome.storage.sync.set({ lastSelectedProject: currentProject })
      loadPrompts()
    })
  }

  addEvent('addProject', 'click', () => {
    const name = prompt('Enter project name:')?.trim()
    if (name) {
      createProject(name)
    }
  })

  addEvent('manageProjectsReal', 'click', () => {
    showProjectModal()
  })

  addEvent('manageProjects', 'click', () => {
    chrome.runtime.openOptionsPage()
  })
})

function setupModalHandlers() {
  const modal = getElement('editModal')
  const form = getRequiredElement<HTMLFormElement>('promptForm')

  form.addEventListener('submit', (e: Event) => {
    e.preventDefault()
    handleFormSubmit()
  })

  addEvent('cancelEdit', 'click', hideEditModal)
  modal?.addEventListener('click', (e: Event) => {
    if (e.target === modal) hideEditModal()
  })

  addEvent('closeProjectModal', 'click', hideProjectModal)
}

async function loadSavedProject(): Promise<void> {
  const result = await getChromeStorage(['lastSelectedProject'])
  if (result.lastSelectedProject) {
    currentProject = result.lastSelectedProject
  }
}

function showEditModal(prompt?: Prompt) {
  const modal = getRequiredElement('editModal')
  const title = getRequiredElement('modalTitle')
  const titleInput = getRequiredElement<HTMLInputElement>('promptTitle')
  const contentInput = getRequiredElement<HTMLTextAreaElement>('promptContent')

  if (prompt) {
    editingPromptId = prompt.id
    title.textContent = 'Edit Prompt'
    titleInput.value = prompt.title
    contentInput.value = prompt.content
  } else {
    editingPromptId = null
    title.textContent = 'Add New Prompt'
    titleInput.value = ''
    contentInput.value = ''

    // Auto-populate from current textarea if available
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: MessageAction.GET_TEXTAREA_CONTENT }, (response) => {
          if (response?.content && !contentInput.value) {
            contentInput.value = response.content
          }
        })
      }
    })
  }

  modal.style.display = 'flex'
  titleInput.focus()
}

function hideEditModal() {
  getRequiredElement('editModal').style.display = 'none'
  editingPromptId = null
}

function showProjectModal() {
  const modal = getRequiredElement('projectModal')
  loadProjectsInModal()
  modal.style.display = 'flex'
}

function hideProjectModal() {
  getRequiredElement('projectModal').style.display = 'none'
}

async function loadProjectsInModal() {
  const [projectsResponse, settingsResult] = await Promise.all([
    sendMessage<ProjectsResponse>(MessageAction.GET_PROJECTS),
    getChromeStorage(['settings']),
  ])

  const projects = projectsResponse.projects || []
  const settings = settingsResult.settings || {}
  const projectList = getRequiredElement('projectList')

  const defaultProjectName = getProjectDisplayName('default', [], settings)
  const allProjects = [
    { id: 'default', name: defaultProjectName, description: '', createdAt: '' },
    ...projects,
  ]

  const totalProjects = allProjects.length
  projectList.innerHTML = ''

  allProjects.forEach(project => {
    const isOnlyProject = totalProjects === 1
    const projectItem = document.createElement('div')
    projectItem.className = 'project-item'

    const deleteButton = isOnlyProject
      ? '<span style="color: #666; font-size: 11px;">Cannot delete last project</span>'
      : `<button class="project-btn delete" data-project-id="${project.id}" data-action="delete">Delete</button>`

    projectItem.innerHTML = `
      <div class="project-name">${escapeHtml(project.name)}</div>
      <div class="project-actions">
        <button class="project-btn" data-project-id="${project.id}" data-project-name="${escapeHtml(project.name)}" data-action="rename">Rename</button>
        ${deleteButton}
      </div>
    `
    projectList.appendChild(projectItem)
  })
}

async function renameProject(projectId: string, currentName: string) {
  const newName = prompt('Enter new project name:', currentName)
  if (newName && newName.trim() && newName.trim() !== currentName) {
    const response = await sendMessage<MessageResponse>(MessageAction.SAVE_PROJECT, {
      id: projectId,
      name: newName.trim(),
    })
    if (response.success) {
      loadProjectsInModal()
      loadProjects() // Refresh dropdown
    }
  }
}

async function deleteProject(projectId: string) {
  if (confirmAction('Are you sure you want to delete this project? All prompts in this project will be moved to the default project.')) {
    const response = await sendMessage<MessageResponse>(MessageAction.DELETE_PROJECT, { id: projectId })
    if (response.success) {
      if (currentProject === projectId) {
        currentProject = 'default'
        chrome.storage.sync.set({ lastSelectedProject: currentProject })
      }
      loadProjectsInModal()
      loadProjects()
      loadPrompts()
    }
  }
}

function setupProjectEventHandlers() {
  const projectModal = getRequiredElement('projectModal')

  projectModal.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement

    if (e.target === projectModal) {
      hideProjectModal()
      return
    }

    if (!target.matches('button[data-action]')) return

    const action = target.dataset.action
    const projectId = target.dataset.projectId

    if (action === 'rename' && projectId) {
      const projectName = target.dataset.projectName || ''
      renameProject(projectId, projectName)
    } else if (action === 'delete' && projectId) {
      deleteProject(projectId)
    }
  })
}

function handleFormSubmit() {
  const title = getRequiredElement<HTMLInputElement>('promptTitle').value.trim()
  const content = getRequiredElement<HTMLTextAreaElement>('promptContent').value.trim()

  if (!title || !content) {
    alert('Please fill in both title and content')
    return
  }

  if (editingPromptId) {
    updatePrompt(editingPromptId, title, content)
  } else {
    savePrompt(title, content)
  }
}

async function loadProjects() {
  const [projectsResponse, settingsResult] = await Promise.all([
    sendMessage<ProjectsResponse>(MessageAction.GET_PROJECTS),
    getChromeStorage(['settings']),
  ])

  displayProjects(projectsResponse.projects || [], settingsResult.settings || {})
}

function displayProjects(projects: Project[], settings: Partial<ExtensionSettings>) {
  const projectSelect = getElement<HTMLSelectElement>('projectSelect')
  if (!projectSelect) return

  const defaultProjectName = getProjectDisplayName('default', [], settings)
  populateSelectOptions(
    projectSelect,
    projects.map(p => ({ value: p.id, text: p.name })),
    { value: 'default', text: defaultProjectName },
  )

  projectSelect.value = currentProject
}

async function loadPrompts() {
  const response = await sendMessage<PromptsResponse>(MessageAction.GET_PROMPTS, { project: currentProject })
  displayPrompts(response.prompts || [])
}

function displayPrompts(prompts: Prompt[]) {
  const promptList = getElement('promptList')
  if (!promptList) return

  if (prompts.length === 0) {
    promptList.innerHTML = '<p style="color: #666; text-align: center;">No prompts saved yet</p>'
    return
  }

  promptList.innerHTML = ''

  prompts.forEach(prompt => {
    const promptElement = document.createElement('div')
    promptElement.className = 'prompt-item'
    promptElement.innerHTML = `
      <div class="prompt-title">${escapeHtml(prompt.title)}</div>
      <div class="prompt-preview">${escapeHtml(truncate(prompt.content, 50))}</div>
      <div class="prompt-actions">
        <button class="prompt-btn edit" data-id="${prompt.id}">Edit</button>
        <button class="prompt-btn delete" data-id="${prompt.id}">Delete</button>
        <button class="prompt-btn copy" data-id="${prompt.id}">Copy</button>
        <button class="prompt-btn insert" data-id="${prompt.id}">Insert</button>
      </div>
    `

    const editBtn = promptElement.querySelector('.edit')
    const deleteBtn = promptElement.querySelector('.delete')
    const copyBtn = promptElement.querySelector('.copy')
    const insertBtn = promptElement.querySelector('.insert')

    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      showEditModal(prompt)
    })

    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (confirmAction(`Delete prompt "${prompt.title}"?`)) {
        deletePrompt(prompt.id)
      }
    })

    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      copyPromptToClipboard(prompt.content)
    })

    insertBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      insertPromptIntoPage(prompt.content)
    })

    promptElement.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.prompt-actions')) {
        insertPromptIntoPage(prompt.content)
      }
    })

    promptList.appendChild(promptElement)
  })
}

async function savePrompt(title: string, content: string) {
  const response = await sendMessage<MessageResponse>(MessageAction.SAVE_PROMPT, {
    title, content, project: currentProject,
  })
  if (response.success) {
    hideEditModal()
    loadPrompts()
  }
}

async function updatePrompt(id: string, title: string, content: string) {
  const response = await sendMessage<MessageResponse>(MessageAction.UPDATE_PROMPT, {
    id, title, content, project: currentProject,
  })
  if (response.success) {
    hideEditModal()
    loadPrompts()
  }
}

async function deletePrompt(id: string) {
  const response = await sendMessage<MessageResponse>(MessageAction.DELETE_PROMPT, { id })
  if (response.success) {
    loadPrompts()
  }
}

async function createProject(name: string) {
  const response = await sendMessage<SaveProjectResponse>(MessageAction.SAVE_PROJECT, { name })
  if (response.success) {
    loadProjects()
    const projectSelect = getElement<HTMLSelectElement>('projectSelect')
    if (projectSelect && response.project) {
      currentProject = response.project.id
      projectSelect.value = currentProject
      loadPrompts()
    }
  }
}

function insertPromptIntoPage(content: string) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: MessageAction.INSERT_PROMPT,
        content,
      })
      window.close() // Close popup after inserting
    }
  })
}

async function copyPromptToClipboard(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    // Show temporary feedback
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      animation: fadeIn 0.3s ease-in;
    `
    notification.textContent = 'Copied to clipboard!'
    document.body.appendChild(notification)

    // Remove notification after 2 seconds
    setTimeout(() => {
      notification.remove()
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
    // Fallback: show error message
    alert('Failed to copy to clipboard')
  }
}

