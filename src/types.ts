export interface Prompt {
  id: string
  title: string
  content: string
  project: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
}

export interface ExtensionSettings {
  enableNotifications: boolean
  enableContextMenu: boolean
  defaultProjectName?: string
}

export enum MessageAction {
  GET_PROMPTS = 'getPrompts',
  GET_PROJECTS = 'getProjects',
  SAVE_PROMPT = 'savePrompt',
  UPDATE_PROMPT = 'updatePrompt',
  DELETE_PROMPT = 'deletePrompt',
  SAVE_PROJECT = 'saveProject',
  DELETE_PROJECT = 'deleteProject',
  UPDATE_CONTEXT_MENU = 'updateContextMenu',
  SHOW_NOTIFICATION = 'showNotification',
  INSERT_PROMPT = 'insertPrompt',
  GET_TEXTAREA_CONTENT = 'getTextareaContent'
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enableNotifications: true,
  enableContextMenu: true,
}

export interface ChromeTab {
  id?: number
  url?: string
  title?: string
}

export interface ChromeContextMenuInfo {
  menuItemId: string | number
  parentMenuItemId?: string | number
  mediaType?: string
  linkUrl?: string
  srcUrl?: string
  pageUrl?: string
  frameUrl?: string
  selectionText?: string
  editable?: boolean
}

export interface StorageResult {
  [key: string]: unknown
  prompts?: Prompt[]
  projects?: Project[]
  settings?: Partial<ExtensionSettings>
  lastSelectedProject?: string
}

export interface MessageRequest {
  action: MessageAction
  [key: string]: unknown
}

export interface InsertPromptResponse {
  success: boolean
}

export interface MessageResponse {
  success?: boolean
  error?: string
}

export interface PromptsResponse extends MessageResponse {
  prompts: Prompt[]
}

export interface ProjectsResponse extends MessageResponse {
  projects: Project[]
}

export interface SaveProjectResponse extends MessageResponse {
  project?: Project
}

export interface DeleteProjectResponse extends MessageResponse {
  newDefaultId?: string
}
