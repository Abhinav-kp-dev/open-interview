export interface ElectronAPI {
  getMemoryState: () => Promise<{
    version: 1
    profile: {
      id: string
      createdAt: string
      lastSeenAt: string
    }
    activeSession: {
      promptDraft: string
      problemInfo: any
      solution: any
      debug: any
      updatedAt: string | null
    }
    preferences: {
      preferredLanguage: string | null
      explanationStyle: "concise" | "balanced" | "detailed"
      inputStyle: "text-heavy" | "screenshot-heavy" | "mixed"
      responseTraits: string[]
      commonTopics: string[]
      debuggingFrequency: "low" | "medium" | "high"
    }
    longTermSummary: string
    personalFacts?: {
      userName: string | null
    }
    modeInsights?: {
      coding: {
        preferences: {
          preferredLanguage: string | null
          explanationStyle: "concise" | "balanced" | "detailed"
          inputStyle: "text-heavy" | "screenshot-heavy" | "mixed"
          responseTraits: string[]
          commonTopics: string[]
          debuggingFrequency: "low" | "medium" | "high"
        }
        longTermSummary: string
      }
      general: {
        preferences: {
          preferredLanguage: string | null
          explanationStyle: "concise" | "balanced" | "detailed"
          inputStyle: "text-heavy" | "screenshot-heavy" | "mixed"
          responseTraits: string[]
          commonTopics: string[]
          debuggingFrequency: "low" | "medium" | "high"
        }
        longTermSummary: string
      }
    }
    history: Array<{
      id: string
      type: "solve" | "debug"
      mode?: "coding" | "general"
      createdAt: string
      userInput: string
      language?: string | null
      problemInfo?: any
      solution?: any
      debug?: any
    }>
  }>
  savePromptDraft: (promptDraft: string) => Promise<void>
  getConfig: () => Promise<{
    apiKey: string
    apiProvider: "openai" | "gemini" | "anthropic" | "ollama"
    assistantMode?: "coding" | "general"
    extractionModel: string
    solutionModel: string
    debuggingModel: string
    debugMenuEnabled?: boolean
    ollamaHost: string
    language?: string
    opacity?: number
    preferredWindowWidth?: number
    preferredWindowHeight?: number
  }>
  updateConfig: (config: {
    apiKey?: string
    apiProvider?: "openai" | "gemini" | "anthropic" | "ollama"
    assistantMode?: "coding" | "general"
    extractionModel?: string
    solutionModel?: string
    debuggingModel?: string
    debugMenuEnabled?: boolean
    ollamaHost?: string
    language?: string
    opacity?: number
    preferredWindowWidth?: number
    preferredWindowHeight?: number
  }) => Promise<boolean>
  checkApiKey: () => Promise<boolean>
  getOllamaModels: (ollamaHost?: string) => Promise<{
    success: boolean
    models?: Array<{ name: string; size?: number; modifiedAt?: string }>
    error?: string
  }>
  validateApiKey: (payload: {
    apiKey?: string
    provider?: "ollama"
    ollamaHost?: string
  } | string) => Promise<{ valid: boolean; error?: string }>
  openLink: (url: string) => void
  onApiKeyInvalid: (callback: () => void) => () => void
  removeListener: (eventName: string, callback: (...args: any[]) => void) => void

  // Original methods
  openSubscriptionPortal: (authData: {
    id: string
    email: string
  }) => Promise<{ success: boolean; error?: string }>
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  clearStore: () => Promise<{ success: boolean; error?: string }>
  getScreenshots: () => Promise<{
    success: boolean
    previews?: Array<{ path: string; preview: string }> | null
    error?: string
  }>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onDebugStream: (callback: (data: { content: string }) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onSolutionStream: (callback: (data: { content: string }) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  openExternal: (url: string) => void
  focusMainWindow: () => Promise<{ success: boolean; error?: string }>
  setWindowFocusable: (focusable: boolean) => Promise<{ success: boolean; error?: string }>
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
  triggerProcessScreenshots: (payload?: { userText?: string; mode?: "solve" | "debug" }) => Promise<{ success: boolean; error?: string }>
  terminateProcessing: () => Promise<{ success: boolean; error?: string }>
  triggerReset: () => Promise<{ success: boolean; error?: string }>
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>
  decreaseWindowOpacity: () => Promise<{ success: boolean; opacity?: number | null; error?: string }>
  increaseWindowOpacity: () => Promise<{ success: boolean; opacity?: number | null; error?: string }>
  onSubscriptionUpdated: (callback: () => void) => () => void
  onSubscriptionPortalClosed: (callback: () => void) => () => void
  startUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void

  decrementCredits: () => Promise<void>
  setInitialCredits: (credits: number) => Promise<void>
  onCreditsUpdated: (callback: (credits: number) => void) => () => void
  onOutOfCredits: (callback: () => void) => () => void
  openSettingsPortal: () => Promise<void>
  getPlatform: () => string
  onDeleteAllScreenshots: (callback: () => void) => () => void
  onClearTextInput: (callback: () => void) => () => void
  onProcessCurrentInput: (callback: () => void) => () => void
  onFocusPromptInput: (callback: () => void) => () => void
  onWindowOpacityUpdated: (
    callback: (data: { opacity: number }) => void
  ) => () => void
  onScrollContent: (callback: (data: { deltaY: number }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    electron: {
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => void
        removeListener: (
          channel: string,
          func: (...args: any[]) => void
        ) => void
      }
    }
    __CREDITS__: number
    __LANGUAGE__: string
    __IS_INITIALIZED__: boolean
    __AUTH_TOKEN__?: string | null
  }
}
