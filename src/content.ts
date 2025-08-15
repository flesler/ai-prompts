import { getPlatformName, getSelectorsForDomain } from './domains.js'
import { MessageAction } from './types.js'
import { truncate } from './utils.js'

// Only storage and runtime messaging are available in content scripts
// chrome.tabs, chrome.contextMenus, chrome.notifications are NOT available

console.log('AI Prompts content script loaded')

let currentInput: HTMLElement | null = null
let floatingButton: HTMLElement | null = null
let platformSelectors: string[] = []
let platformName: string | undefined = undefined

let isInitialized = false

function init() {
  // Check if extension context is valid
  if (!chrome?.runtime?.id) {
    console.warn('AI Prompts: Extension context not ready, will retry in 1 second...')
    setTimeout(init, 1000)
    return
  }

  // Prevent double initialization
  if (isInitialized) {
    console.log('AI Prompts: Already initialized, skipping')
    return
  }

  try {
    // Set up message listener only if extension context is valid
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === MessageAction.INSERT_PROMPT) {
        console.log('🤖 AI Prompts - Context menu insert triggered:', truncate(request.content || '', 50))
        const success = insertPromptIntoActiveElement(request.content)
        sendResponse({ success })
      } else if (request.action === MessageAction.GET_TEXTAREA_CONTENT) {
        sendResponse({ content: getText() })
      }
    })

    const fullHostPath = window.location.hostname + window.location.pathname
    platformSelectors = getSelectorsForDomain(fullHostPath)
    platformName = getPlatformName(fullHostPath)

    // Only create button and setup detection for recognized AI platforms
    if (platformName) {
      createFloatingButton()
      setupInputDetection()
      console.log(`AI Prompts: Activated for ${platformName} with selectors:`, platformSelectors)
    } else {
      console.log('AI Prompts: Unknown platform, extension disabled')
    }

    isInitialized = true
  } catch (error) {
    console.error('AI Prompts: Initialization failed:', error)
    setTimeout(init, 2000) // Retry after 2 seconds
  }
}

function createFloatingButton() {
  // Ensure document.body exists
  if (!document.body) {
    console.warn('AI Prompts: Document body not ready, retrying in 100ms...')
    setTimeout(createFloatingButton, 100)
    return
  }

  floatingButton = document.createElement('button')
  floatingButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/>
      <path d="M19 17v4"/>
      <path d="M3 5h4"/>
      <path d="M17 19h4"/>
    </svg>
  `
  floatingButton.className = 'ai-prompts-floating-btn'
  floatingButton.title = 'AI Prompts - Click to insert'
  floatingButton.style.cssText = `
    position: absolute;
    z-index: 10000;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    cursor: pointer;
    display: none;
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: none;
    align-items: center;
    justify-content: center;
  `

  floatingButton.addEventListener('mouseenter', () => {
    floatingButton!.style.transform = 'scale(1.1) translateY(-2px)'
    floatingButton!.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.6)'
  })

  floatingButton.addEventListener('mouseleave', () => {
    floatingButton!.style.transform = 'scale(1) translateY(0)'
    floatingButton!.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)'
  })

  floatingButton.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'openPopup' })
    } else {
      alert('Extension was updated. Please reload this page to continue using AI Prompts.')
    }
  })

  document.body.appendChild(floatingButton)
  showFloatingButton(currentInput)
}

function setupInputDetection() {
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement
    if (isInputElement(target)) {
      showFloatingButton(target)
    } else {
      recalculate()
    }
  })

  let resizeTimeout: number
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = window.setTimeout(recalculate, 100)
  })

  window.setInterval(recalculate, 2000)
}

function recalculate() {
  if (currentInput && !isElementVisible(currentInput)) {
    showFloatingButton(null)
  } else {
    showFloatingButton(currentInput)
  }
}

function isInputElement(element: HTMLElement): boolean {
  for (const selector of platformSelectors) {
    try {
      if (element.matches(selector)) {
        return true
      }
    } catch (e) {
      continue
    }
  }
  return false
}

function isElementVisible(element: HTMLElement): boolean {
  if (!element.parentElement) {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight
}

function showFloatingButton(input: HTMLElement | null) {
  currentInput = input
  if (!floatingButton) return
  if (!input) {
    floatingButton.style.display = 'none'
    return
  }

  const rect = input.getBoundingClientRect()
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

  const buttonSize = 32
  const buttonCenter = buttonSize / 2
  const padding = 8

  floatingButton.style.display = 'flex'

  floatingButton.style.top = `${rect.top + scrollTop + (rect.height / 2) - buttonCenter}px`
  floatingButton.style.left = `${rect.right + scrollLeft - buttonSize - padding}px`
}

function showTemporarySuccess() {
  if (floatingButton) {
    const originalInner = floatingButton.innerHTML
    const originalBackground = floatingButton.style.background

    floatingButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    `
    floatingButton.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    floatingButton.style.transform = 'scale(1.2) translateY(-4px)'
    floatingButton.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.6)'

    setTimeout(() => {
      if (floatingButton) {
        floatingButton.innerHTML = originalInner
        floatingButton.style.background = originalBackground
        floatingButton.style.transform = 'scale(1) translateY(0)'
        floatingButton.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)'
      }
    }, 1500)
  }
}

function insertPromptIntoActiveElement(content: string): boolean {
  const fullHostPath = window.location.hostname + window.location.pathname
  const currentPlatformName = getPlatformName(fullHostPath)

  // Don't insert on unknown platforms
  if (!currentPlatformName) {
    console.log('🤖 AI Prompts - Insert blocked: Unknown platform')
    return false
  }

  const selectors = getSelectorsForDomain(fullHostPath)
  let targetElement: HTMLElement | null = null

  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement
    if (element) {
      targetElement = element
      break
    }
  }

  if (!targetElement) {
    targetElement = currentInput || document.activeElement as HTMLElement
  }
  console.log('🤖 AI Prompts - Insert attempt:', {
    targetElement,
    foundBySelector: !!document.querySelector(selectors[0]),
    selectors,
    currentInput,
    activeElement: document.activeElement,
    tagName: targetElement?.tagName,
    contentEditable: targetElement?.contentEditable,
  })

  if (!targetElement) {
    console.error('🤖 AI Prompts - No target element found')
    alert('❌ No input field found. Please click on a text input or textarea first.')
    return false
  }

  if (targetElement && (
    targetElement.tagName === 'TEXTAREA' ||
    targetElement.tagName === 'INPUT' ||
    targetElement.contentEditable === 'true'
  )) {
    if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT') {
      const input = targetElement as HTMLInputElement | HTMLTextAreaElement
      const currentValue = input.value

      const separator = currentValue ? '\n' : ''
      input.value = content + separator + currentValue
      input.focus()
      input.setSelectionRange(content.length + separator.length, content.length + separator.length)

      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      console.log('🤖 AI Prompts - Successfully inserted into input/textarea:', truncate(content, 50))

      showTemporarySuccess()
      return true
    } else {
      const currentContent = targetElement.textContent || ''
      const separator = currentContent ? '\n' : ''
      const newContent = content + separator + currentContent

      targetElement.textContent = newContent
      targetElement.focus()

      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        const textNode = targetElement.firstChild
        if (textNode) {
          const cursorPosition = content.length + separator.length
          range.setStart(textNode, cursorPosition)
          range.setEnd(textNode, cursorPosition)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }

      console.log('🤖 AI Prompts - Successfully inserted into contentEditable:', truncate(content, 50))

      showTemporarySuccess()
      return true
    }
  } else {
    console.error('🤖 AI Prompts - Invalid target element:', {
      tagName: targetElement?.tagName,
      contentEditable: targetElement?.contentEditable,
      platformName: currentPlatformName,
    })
    alert(`❌ Cannot insert prompt: No valid input field found on this ${currentPlatformName} page. Please click on a text input first.`)
    return false
  }
}

function getText(): string {
  const input = currentInput as HTMLInputElement | HTMLTextAreaElement | undefined
  return input?.value?.trim() || input?.textContent?.trim() || ''
}

// Always try to initialize - init() will handle retries if Chrome context isn't ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// Set up a periodic check to reinitialize if extension gets reloaded
setInterval(() => {
  if (!isInitialized && chrome?.runtime?.id) {
    console.log('AI Prompts: Extension context recovered, attempting initialization...')
    init()
  }
}, 5000) // Check every 5 seconds
