export interface DomainGroup {
  domains: string[]
  selectors: string[]
  name: string
}

const FALLBACK_SELECTORS = ['textarea', '[contenteditable="true"]']

const AI_DOMAIN_GROUPS: DomainGroup[] = [
  {
    domains: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
    selectors: ['#prompt-textarea', 'form textarea', '.ProseMirror[contenteditable="true"]'],
    name: 'OpenAI',
  },
  {
    domains: ['claude.ai', 'console.anthropic.com'],
    selectors: ['.ProseMirror[contenteditable="true"]'],
    name: 'Claude',
  },
  {
    domains: ['gemini.google.com'],
    selectors: ['.ql-editor[contenteditable="true"]'],
    name: 'Google Gemini',
  },
  {
    domains: ['copilot.microsoft.com', 'bing.com/chat'],
    selectors: ['#userInput'],
    name: 'Microsoft AI',
  },
  {
    domains: ['perplexity.ai'],
    selectors: ['#ask-input'],
    name: 'Perplexity',
  },
  {
    domains: ['x.com/i/grok'],
    selectors: ['textarea[placeholder="Ask anything"]'],
    name: 'X\'s Grok',
  },
  {
    domains: ['grok.com'],
    selectors: ['.tiptap[contenteditable="true"]'],
    name: 'Grok',
  },
]

export function getSelectorsForDomain(hostPath: string): string[] {
  const group = findDomainGroup(hostPath)
  const groupSelectors = group?.selectors || []
  return [...groupSelectors, ...FALLBACK_SELECTORS]
}

export function getPlatformName(hostPath: string): string | undefined {
  const group = findDomainGroup(hostPath)
  return group?.name
}

export function generateDomainMatches(): string[] {
  return AI_DOMAIN_GROUPS.flatMap(group =>
    group.domains.flatMap(domain => {
      // Path-specific domains use * (no slash) to match query params and sub-paths
      // Regular domains use /* to match any sub-path
      const suffix = domain.includes('/') ? '*' : '/*'
      const patterns = [`*://${domain}${suffix}`]
      // Only add www. for root domains (2 parts: example.com)
      const hostname = domain.split('/')[0]
      const isRootDomain = hostname.split('.').length === 2
      if (isRootDomain) {
        patterns.push(`*://www.${domain}${suffix}`)
      }
      return patterns
    }),
  )
}

function findDomainGroup(hostPath: string): DomainGroup | undefined {
  const cleanHostPath = hostPath.replace(/^www\./, '')
  return AI_DOMAIN_GROUPS.find(g =>
    g.domains.some(domain => {
      // Handle path-specific domains like 'x.com/i/grok'
      if (domain.includes('/')) {
        return cleanHostPath === domain || cleanHostPath.startsWith(domain + '/')
      }
      // Handle regular domains like 'openai.com'
      const hostname = cleanHostPath.split('/')[0]
      return hostname === domain || hostname.endsWith(`.${domain}`)
    }),
  )
}
