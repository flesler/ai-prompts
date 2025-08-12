export interface DomainGroup {
  domains: string[]
  selectors: string[]
  name: string
}

export const FALLBACK_SELECTORS = ['textarea', '[contenteditable="true"]', 'input[type="search"]', 'input[type="text"]']

export const AI_DOMAIN_GROUPS: DomainGroup[] = [
  {
    domains: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
    selectors: ['form textarea'],
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
    name: 'Google AI',
  },
  {
    domains: ['copilot.microsoft.com', 'bing.com'],
    selectors: ['#userInput'],
    name: 'Microsoft AI',
  },
  {
    domains: ['perplexity.ai'],
    selectors: ['#ask-input'],
    name: 'Perplexity',
  },
  {
    domains: ['x.com', 'grok.com'],
    selectors: ['.tiptap[contenteditable="true"]'],
    name: 'X/Grok',
  },
]

export function getSelectorsForDomain(hostname: string): string[] {
  const cleanHostname = hostname.replace(/^www\./, '')
  const group = AI_DOMAIN_GROUPS.find(g =>
    g.domains.some(domain => cleanHostname === domain || cleanHostname.endsWith(`.${domain}`)),
  )

  const groupSelectors = group?.selectors || []
  return [...groupSelectors, ...FALLBACK_SELECTORS]
}

export function getPlatformName(hostname: string): string {
  const cleanHostname = hostname.replace(/^www\./, '')
  const group = AI_DOMAIN_GROUPS.find(g =>
    g.domains.some(domain => cleanHostname === domain || cleanHostname.endsWith(`.${domain}`)),
  )
  return group?.name || 'AI Platform'
}

export function generateDomainMatches(): string[] {
  return AI_DOMAIN_GROUPS.flatMap(group =>
    group.domains.flatMap(domain => [
      `*://${domain}/*`,
      `*://www.${domain}/*`,
    ]),
  )
}
