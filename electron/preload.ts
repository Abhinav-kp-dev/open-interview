console.log("Preload script starting...")
import { contextBridge, ipcRenderer } from "electron"
const { shell } = require("electron")

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  OUT_OF_CREDITS: "out-of-credits",
  API_KEY_INVALID: "api-key-invalid",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_STREAM: "solution-stream",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",
  RESET: "reset",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_STREAM: "debug-stream",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// At the top of the file
console.log("Preload script is running")

const electronAPI = {
  // Original methods
  openSubscriptionPortal: async (authData: { id: string; email: string }) => {
    return ipcRenderer.invoke("open-subscription-portal", authData)
  },
  openSettingsPortal: () => ipcRenderer.invoke("open-settings-portal"),
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  clearStore: () => ipcRenderer.invoke("clear-store"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),
  toggleMainWindow: async () => {
    console.log("toggleMainWindow called from preload")
    try {
      const result = await ipcRenderer.invoke("toggle-window")
      console.log("toggle-window result:", result)
      return result
    } catch (error) {
      console.error("Error in toggleMainWindow:", error)
      throw error
    }
  },
  focusMainWindow: () => ipcRenderer.invoke("focus-window"),
  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },
  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugStream: (callback: (data: { content: string }) => void) => {
    const subscription = (_: any, data: { content: string }) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_STREAM, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_STREAM, subscription)
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },
  onOutOfCredits: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    }
  },
  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onSolutionStream: (callback: (data: { content: string }) => void) => {
    const subscription = (_: any, data: { content: string }) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_STREAM, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_STREAM,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  // External URL handler
  openLink: (url: string) => shell.openExternal(url),
  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  triggerProcessScreenshots: (payload?: { userText?: string; mode?: "solve" | "debug" }) =>
    ipcRenderer.invoke("trigger-process-screenshots", payload),
  terminateProcessing: () => ipcRenderer.invoke("terminate-processing"),
  triggerReset: () => ipcRenderer.invoke("trigger-reset"),
  triggerMoveLeft: () => ipcRenderer.invoke("trigger-move-left"),
  triggerMoveRight: () => ipcRenderer.invoke("trigger-move-right"),
  triggerMoveUp: () => ipcRenderer.invoke("trigger-move-up"),
  triggerMoveDown: () => ipcRenderer.invoke("trigger-move-down"),
  decreaseWindowOpacity: () => ipcRenderer.invoke("decrease-window-opacity"),
  increaseWindowOpacity: () => ipcRenderer.invoke("increase-window-opacity"),
  onSubscriptionUpdated: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-updated", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-updated", subscription)
    }
  },
  onSubscriptionPortalClosed: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-portal-closed", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-portal-closed", subscription)
    }
  },
  onReset: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.RESET, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.RESET, subscription)
    }
  },
  startUpdate: () => ipcRenderer.invoke("start-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-available", subscription)
    }
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-downloaded", subscription)
    return () => {
      ipcRenderer.removeListener("update-downloaded", subscription)
    }
  },
  decrementCredits: () => ipcRenderer.invoke("decrement-credits"),
  onCreditsUpdated: (callback: (credits: number) => void) => {
    const subscription = (_event: any, credits: number) => callback(credits)
    ipcRenderer.on("credits-updated", subscription)
    return () => {
      ipcRenderer.removeListener("credits-updated", subscription)
    }
  },
  getPlatform: () => process.platform,
  
  // Configuration helpers
  getConfig: () => ipcRenderer.invoke("get-config"),
  getMemoryState: () => ipcRenderer.invoke("get-memory-state"),
  savePromptDraft: (promptDraft: string) =>
    ipcRenderer.invoke("save-prompt-draft", promptDraft),
  updateConfig: (config: {
    apiKey?: string;
    apiProvider?: "openai" | "gemini" | "anthropic" | "ollama";
    assistantMode?: "coding" | "general";
    extractionModel?: string;
    solutionModel?: string;
    debuggingModel?: string;
    ollamaHost?: string;
    language?: string;
    opacity?: number;
  }) =>
    ipcRenderer.invoke("update-config", config),
  onShowSettings: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("show-settings-dialog", subscription)
    return () => {
      ipcRenderer.removeListener("show-settings-dialog", subscription)
    }
  },
  checkApiKey: () => ipcRenderer.invoke("check-api-key"),
  getOllamaModels: (ollamaHost?: string) => ipcRenderer.invoke("get-ollama-models", ollamaHost),
  validateApiKey: (payload: { apiKey?: string; provider?: "openai" | "gemini" | "anthropic" | "ollama"; ollamaHost?: string } | string) =>
    ipcRenderer.invoke("validate-api-key", payload),
  openExternal: (url: string) => 
    ipcRenderer.invoke("openExternal", url),
  onApiKeyInvalid: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    }
  },
  removeListener: (eventName: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(eventName, callback)
  },
  onDeleteAllScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("delete-all-screenshots", subscription)
    return () => {
      ipcRenderer.removeListener("delete-all-screenshots", subscription)
    }
  },
  onClearTextInput: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("clear-text-input", subscription)
    return () => {
      ipcRenderer.removeListener("clear-text-input", subscription)
    }
  },
  onProcessCurrentInput: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("process-current-input", subscription)
    return () => {
      ipcRenderer.removeListener("process-current-input", subscription)
    }
  },
  onFocusPromptInput: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("focus-prompt-input", subscription)
    return () => {
      ipcRenderer.removeListener("focus-prompt-input", subscription)
    }
  },
  onWindowOpacityUpdated: (callback: (data: { opacity: number }) => void) => {
    const subscription = (_: any, data: { opacity: number }) => callback(data)
    ipcRenderer.on("window-opacity-updated", subscription)
    return () => {
      ipcRenderer.removeListener("window-opacity-updated", subscription)
    }
  },
  onScrollContent: (callback: (data: { deltaY: number }) => void) => {
    const subscription = (_: any, data: { deltaY: number }) => callback(data)
    ipcRenderer.on("scroll-content", subscription)
    return () => {
      ipcRenderer.removeListener("scroll-content", subscription)
    }
  },
  // Superadmin stealth mode
  toggleSuperadminMode: (enabled: boolean) =>
    ipcRenderer.invoke("toggle-superadmin-mode", enabled),
  getSuperadminMode: () =>
    ipcRenderer.invoke("get-superadmin-mode"),
  setSettingsDialogOpen: (open: boolean) =>
    ipcRenderer.invoke("set-settings-dialog-open", open),
  onSuperadminModeChanged: (callback: (data: { enabled: boolean }) => void) => {
    const subscription = (_: any, data: { enabled: boolean }) => callback(data)
    ipcRenderer.on("superadmin-mode-changed", subscription)
    return () => {
      ipcRenderer.removeListener("superadmin-mode-changed", subscription)
    }
  }
}

// Before exposing the API
console.log(
  "About to expose electronAPI with methods:",
  Object.keys(electronAPI)
)

// Expose the API
contextBridge.exposeInMainWorld("electronAPI", electronAPI)

console.log("electronAPI exposed to window")

// Add this focus restoration handler
ipcRenderer.on("restore-focus", () => {
  // Try to focus the active element if it exists
  const activeElement = document.activeElement as HTMLElement
  if (activeElement && typeof activeElement.focus === "function") {
    activeElement.focus()
  }
})

// Remove auth-callback handling - no longer needed
