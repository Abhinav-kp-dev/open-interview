import { app, BrowserWindow, screen, shell, ipcMain } from "electron"
import path from "path"
import fs from "fs"
import { initializeIpcHandlers } from "./ipcHandlers"
import { ProcessingHelper } from "./ProcessingHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { initAutoUpdater } from "./autoUpdater"
import { configHelper } from "./ConfigHelper"
import { memoryHelper } from "./MemoryHelper"
import * as dotenv from "dotenv"

// Constants
const isDev = process.env.NODE_ENV === "development"
const shouldDisableGpu =
  process.platform === "win32" &&
  (isDev || process.env.ELECTRON_DISABLE_GPU === "1")
const isWindows = process.platform === "win32"
const useTransparentWindow = !isWindows
const MIN_WINDOW_OPACITY = 0.1
const MAX_WINDOW_OPACITY = 1
const WINDOW_OPACITY_STEP = 0.1

// Hide Dock on macOS so application acts as an accessory overlay without stealing app focus
if (process.platform === "darwin" && app.dock) {
  app.dock.hide()
}

if (shouldDisableGpu) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch("disable-gpu")
  app.commandLine.appendSwitch("disable-gpu-compositing")
  console.log("GPU acceleration disabled for Windows stability")
}

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  isWindowVisible: false,
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  step: 0,
  currentX: 0,
  currentY: 0,

  // Superadmin mode
  superadminMode: false,
  isSettingsDialogOpen: false,

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as ProcessingHelper | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,

  // Processing events
  PROCESSING_EVENTS: {
    UNAUTHORIZED: "processing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    OUT_OF_CREDITS: "out-of-credits",
    API_KEY_INVALID: "api-key-invalid",
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_STREAM: "solution-stream",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    DEBUG_START: "debug-start",
    DEBUG_STREAM: "debug-stream",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const
}

function syncWindowInteractionState(win?: BrowserWindow | null): void {
  const targetWindow = win ?? state.mainWindow
  if (!targetWindow || targetWindow.isDestroyed()) return

  const shouldIgnoreMouseEvents = !state.isWindowVisible

  if (shouldIgnoreMouseEvents) {
    targetWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    targetWindow.setIgnoreMouseEvents(false)
  }
}

function syncWindowTaskbarState(win?: BrowserWindow | null): void {
  const targetWindow = win ?? state.mainWindow
  if (!targetWindow || targetWindow.isDestroyed()) return

  targetWindow.setSkipTaskbar(state.superadminMode || !isWindows)
}

function syncWindowStealthState(win?: BrowserWindow | null): void {
  const targetWindow = win ?? state.mainWindow
  if (!targetWindow || targetWindow.isDestroyed()) return

  syncWindowTaskbarState(targetWindow)
  syncWindowInteractionState(targetWindow)
}

// Add interfaces for helper classes
export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null
  getMainWindow: () => BrowserWindow | null
  getView: () => "queue" | "solutions" | "debug"
  setView: (view: "queue" | "solutions" | "debug") => void
  getProblemInfo: () => any
  setProblemInfo: (info: any) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  clearQueues: () => void
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  setHasDebugged: (value: boolean) => void
  getHasDebugged: () => boolean
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  getView: () => "queue" | "solutions" | "debug"
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  focusMainWindow: () => void
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  decreaseWindowOpacity: () => number | null
  increaseWindowOpacity: () => number | null
}

export interface IIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  setWindowDimensions: (width: number, height: number) => void
  setWindowFocusable?: (focusable: boolean) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
  takeScreenshot: () => Promise<string>
  getView: () => "queue" | "solutions" | "debug"
  focusMainWindow: () => void
  toggleMainWindow: () => void
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  decreaseWindowOpacity: () => number | null
  increaseWindowOpacity: () => number | null
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view)
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    getProblemInfo,
    setProblemInfo,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    getImagePreview,
    deleteScreenshot,
    setHasDebugged,
    getHasDebugged,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS
  } as IProcessingHelperDeps)
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    getView,
    takeScreenshot,
    getImagePreview,
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isVisible: () => state.isWindowVisible,
    focusMainWindow,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) =>
        Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
      ),
    moveWindowRight: () =>
      moveWindowHorizontal((x) =>
        Math.min(
          state.screenWidth - (state.windowSize?.width || 0) / 2,
          x + state.step
        )
      ),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step),
    decreaseWindowOpacity: () => adjustWindowOpacity(-WINDOW_OPACITY_STEP),
    increaseWindowOpacity: () => adjustWindowOpacity(WINDOW_OPACITY_STEP)
  } as IShortcutsHelperDeps)
}

// Auth callback handler

// Register the interview-coder protocol
if (process.platform === "darwin") {
  app.setAsDefaultProtocolClient("interview-coder")
} else {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1] || "")
  ])
}

// Handle the protocol. In this case, we choose to show an Error Box.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1])
  ])
}

// Force Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()

// Auth callback removed as we no longer use Supabase authentication

function getLiveWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
}

function pruneExtraWindows(): void {
  const windows = getLiveWindows()
  if (windows.length <= 1) return

  const primaryWindow = state.mainWindow && !state.mainWindow.isDestroyed()
    ? state.mainWindow
    : windows[0]

  state.mainWindow = primaryWindow

  for (const window of windows) {
    if (window === primaryWindow) continue
    console.warn("Closing unexpected extra window", {
      id: window.id,
      bounds: window.getBounds()
    })
    window.close()
  }
}

type WindowShortcutInput = {
  type?: string
  key?: string
  code?: string
  keyCode?: number | string
  control?: boolean
  meta?: boolean
}

function matchesDecreaseOpacityShortcut(input: WindowShortcutInput): boolean {
  const keyboardInput = input

  return (
    keyboardInput.code === "BracketLeft" ||
    keyboardInput.code === "Escape" ||
    keyboardInput.key === "[" ||
    keyboardInput.key === "{" ||
    keyboardInput.key === "Escape" ||
    keyboardInput.key === "Esc" ||
    keyboardInput.keyCode === 219 ||
    keyboardInput.keyCode === "Escape"
  )
}

function matchesIncreaseOpacityShortcut(input: WindowShortcutInput): boolean {
  const keyboardInput = input

  return (
    keyboardInput.code === "BracketRight" ||
    keyboardInput.key === "]" ||
    keyboardInput.key === "}" ||
    keyboardInput.keyCode === 221
  )
}

function matchesFocusPromptShortcut(input: WindowShortcutInput): boolean {
  const keyboardInput = input

  return (
    keyboardInput.code === "Slash" ||
    keyboardInput.code === "NumpadDivide" ||
    keyboardInput.key === "/"
  )
}

function setupFocusedWindowShortcutFallbacks(window: BrowserWindow): void {
  let controlPressed = false
  let metaPressed = false

  window.webContents.on("before-input-event", (event, input) => {
    const keyboardInput = input as unknown as WindowShortcutInput

    const eventType = keyboardInput.type
    const key = keyboardInput.key
    const code = keyboardInput.code

    if (eventType === "keyUp") {
      if (code === "ControlLeft" || code === "ControlRight" || key === "Control") {
        controlPressed = false
      }

      if (code === "MetaLeft" || code === "MetaRight" || key === "Meta") {
        metaPressed = false
      }

      return
    }

    if (eventType !== "keyDown" && eventType !== "rawKeyDown") {
      return
    }

    if (code === "ControlLeft" || code === "ControlRight" || key === "Control") {
      controlPressed = true
    }

    if (code === "MetaLeft" || code === "MetaRight" || key === "Meta") {
      metaPressed = true
    }

    const hasCommandOrControl =
      keyboardInput.control ||
      keyboardInput.meta ||
      controlPressed ||
      metaPressed

    if (!hasCommandOrControl) {
      return
    }

    if (matchesDecreaseOpacityShortcut(keyboardInput)) {
      event.preventDefault()
      console.log("Focused-window fallback: Command/Ctrl + [ pressed.")
      adjustWindowOpacity(-WINDOW_OPACITY_STEP)
      return
    }

    if (matchesIncreaseOpacityShortcut(keyboardInput)) {
      event.preventDefault()
      console.log("Focused-window fallback: Command/Ctrl + ] pressed.")
      adjustWindowOpacity(WINDOW_OPACITY_STEP)
      return
    }

    if (state.view === "queue" && matchesFocusPromptShortcut(keyboardInput)) {
      event.preventDefault()
      console.log("Focused-window fallback: Command/Ctrl + / pressed.")
      focusMainWindow()
      window.webContents.send("focus-prompt-input")
    }
  })
}

// Window management functions
async function createWindow(): Promise<void> {
  pruneExtraWindows()

  if (!state.mainWindow) {
    const existingWindow = getLiveWindows()[0]
    if (existingWindow) {
      state.mainWindow = existingWindow
    }
  }

  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.showInactive()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workAreaSize
  const config = configHelper.loadConfig()
  const preferredWidth = Math.min(
    config.preferredWindowWidth || 800,
    Math.max(750, workArea.width - 32)
  )
  const preferredHeight = Math.min(
    config.preferredWindowHeight || 600,
    Math.max(550, workArea.height - 32)
  )
  state.screenWidth = workArea.width
  state.screenHeight = workArea.height
  state.step = 60
  state.currentY = 50

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    width: preferredWidth,
    height: preferredHeight,
    minWidth: 750,
    minHeight: 550,
    x: state.currentX,
    y: 50,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js"),
      scrollBounce: true
    },
    show: false,
    frame: false,
    transparent: useTransparentWindow,
    fullscreenable: false,
    hasShadow: false,
    opacity: 1.0,  // Start with full opacity
    backgroundColor: useTransparentWindow ? "#00000000" : "#091120",
    focusable: false, // Default to non-focusable: clicking overlay will never steal OS focus from browser
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: true,
    movable: true,
    acceptFirstMouse: true
  }

  state.mainWindow = new BrowserWindow(windowSettings)
  setupFocusedWindowShortcutFallbacks(state.mainWindow)

  state.mainWindow.once("ready-to-show", () => {
    if (!state.mainWindow?.isDestroyed()) {
      showMainWindow()
    }
  })

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading")
    if (!state.mainWindow?.isDestroyed() && !state.isWindowVisible) {
      showMainWindow()
    }
  })
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription)
      if (isDev) {
        // In development, retry loading after a short delay
        console.log("Retrying to load development server...")
        setTimeout(() => {
          state.mainWindow?.loadURL("http://localhost:54321").catch((error) => {
            console.error("Failed to load dev server on retry:", error)
          })
        }, 1000)
      }
    }
  )

  if (isDev) {
    // In development, load from the dev server
    console.log("Loading from development server: http://localhost:54321")
    state.mainWindow.loadURL("http://localhost:54321").catch((error) => {
      console.error("Failed to load dev server, falling back to local file:", error)
      // Fallback to local file if dev server is not available
      const indexPath = path.join(__dirname, "../dist/index.html")
      console.log("Falling back to:", indexPath)
      if (fs.existsSync(indexPath)) {
        state.mainWindow.loadFile(indexPath)
      } else {
        console.error("Could not find index.html in dist folder")
      }
    })
  } else {
    // In production, load from the built files
    const indexPath = path.join(__dirname, "../dist/index.html")
    console.log("Loading production build:", indexPath)
    
    if (fs.existsSync(indexPath)) {
      state.mainWindow.loadFile(indexPath)
    } else {
      console.error("Could not find index.html in dist folder")
    }
  }

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1)
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Attempting to open URL:", url)
    try {
      const parsedURL = new URL(url);
      const hostname = parsedURL.hostname;
      const allowedHosts = ["google.com", "supabase.co"];
      if (allowedHosts.includes(hostname) || hostname.endsWith(".google.com") || hostname.endsWith(".supabase.co")) {
        shell.openExternal(url);
        return { action: "deny" }; // Do not open this URL in a new Electron window
      }
    } catch (error) {
      console.error("Invalid URL %d in setWindowOpenHandler: %d" , url , error);
      return { action: "deny" }; // Deny access as URL string is malformed or invalid
    }
    return { action: "allow" };
  })

  // Enhanced screen capture resistance
  if (!(isWindows && isDev)) {
    state.mainWindow.setContentProtection(true)
  }

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  })
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Prevent window from being captured in screenshots
    state.mainWindow.setHiddenInMissionControl(true)
    state.mainWindow.setWindowButtonVisibility(false)
    state.mainWindow.setBackgroundColor("#00000000")

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true)

    // Disable window shadow
    state.mainWindow.setHasShadow(false)
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(false)
  state.mainWindow.webContents.setFrameRate(60)

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove)
  state.mainWindow.on("resize", handleWindowResize)
  state.mainWindow.on("closed", handleWindowClosed)

  // Initialize window state
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.windowSize = { width: bounds.width, height: bounds.height }
  state.currentX = bounds.x
  state.currentY = bounds.y
  state.isWindowVisible = false

  const savedOpacity = getStoredWindowOpacity()
  console.log(`Setting initial opacity to ${savedOpacity}`)
  applyWindowOpacity(savedOpacity, { persist: false })
}

function handleWindowMove(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.currentX = bounds.x
  state.currentY = bounds.y
}

function handleWindowResize(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowSize = { width: bounds.width, height: bounds.height }
}

function handleWindowClosed(): void {
  const remainingWindows = getLiveWindows()
  if (remainingWindows.length > 0) {
    state.mainWindow = remainingWindows[0]
    state.isWindowVisible = state.mainWindow.isVisible()
    const bounds = state.mainWindow.getBounds()
    state.windowPosition = { x: bounds.x, y: bounds.y }
    state.windowSize = { width: bounds.width, height: bounds.height }
    state.currentX = bounds.x
    state.currentY = bounds.y
    pruneExtraWindows()
    return
  }

  state.mainWindow = null
  state.isWindowVisible = false
  state.windowPosition = null
  state.windowSize = null
}

function clampWindowOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) {
    return MAX_WINDOW_OPACITY
  }

  return Math.min(
    MAX_WINDOW_OPACITY,
    Math.max(MIN_WINDOW_OPACITY, Number(opacity.toFixed(2)))
  )
}

function getStoredWindowOpacity(): number {
  return clampWindowOpacity(configHelper.getOpacity())
}

function applyWindowOpacity(
  opacity: number,
  options?: { persist?: boolean }
): number {
  const nextOpacity = clampWindowOpacity(opacity)

  if (options?.persist !== false) {
    configHelper.setOpacity(nextOpacity)
  }

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.setOpacity(nextOpacity)
    state.mainWindow.webContents.send("window-opacity-updated", {
      opacity: nextOpacity
    })
  }

  return nextOpacity
}

function adjustWindowOpacity(delta: number): number | null {
  const mainWindow = state.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }

  const currentOpacity = state.isWindowVisible
    ? mainWindow.getOpacity()
    : getStoredWindowOpacity()
  const nextOpacity = applyWindowOpacity(currentOpacity + delta)

  if (!state.isWindowVisible) {
    showMainWindow()
  }

  return nextOpacity
}

// Window visibility functions
function hideMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    const bounds = state.mainWindow.getBounds()
    state.windowPosition = { x: bounds.x, y: bounds.y }
    state.windowSize = { width: bounds.width, height: bounds.height }
    state.mainWindow.setOpacity(0)
    state.isWindowVisible = false
    try {
      state.mainWindow.setFocusable(false)
    } catch (_) {}
    syncWindowStealthState(state.mainWindow)
    console.log("Window hidden, opacity set to 0")
  }
}

function showMainWindow(): void {
  pruneExtraWindows()
  if (!state.mainWindow?.isDestroyed()) {
    const display = screen.getDisplayMatching(
      state.windowPosition && state.windowSize
        ? {
            x: state.windowPosition.x,
            y: state.windowPosition.y,
            width: state.windowSize.width,
            height: state.windowSize.height
          }
        : state.mainWindow.getBounds()
    )
    const workArea = display.workArea
    const targetWidth = state.windowSize?.width || 800
    const targetHeight = state.windowSize?.height || 600
    const fallbackX = Math.round(workArea.x + (workArea.width - targetWidth) / 2)
    const fallbackY = Math.round(workArea.y + Math.max(32, (workArea.height - targetHeight) / 6))

    if (state.windowPosition && state.windowSize) {
      state.mainWindow.setBounds({
        x: Math.min(
          Math.max(workArea.x, state.windowPosition.x),
          Math.max(workArea.x, workArea.x + workArea.width - state.windowSize.width)
        ),
        y: Math.min(
          Math.max(workArea.y, state.windowPosition.y),
          Math.max(workArea.y, workArea.y + workArea.height - state.windowSize.height)
        ),
        ...state.windowSize
      })
    } else {
      state.mainWindow.setBounds({
        x: fallbackX,
        y: fallbackY,
        width: targetWidth,
        height: targetHeight
      })
    }
    if (state.mainWindow.isMinimized()) {
      state.mainWindow.restore()
    }
    state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    })
    if (!(isWindows && isDev)) {
      state.mainWindow.setContentProtection(true)
    }
    applyWindowOpacity(getStoredWindowOpacity(), { persist: false })
    syncWindowTaskbarState(state.mainWindow)
    // Non-activating stealth show: never steal OS focus from the active browser or interview window
    state.mainWindow.showInactive()
    state.mainWindow.moveTop()
    state.isWindowVisible = true
    syncWindowStealthState(state.mainWindow)
    console.log("Window shown inactive (stealth mode - focus maintained on background app)")
  }
}

function toggleMainWindow(): void {
  console.log(`Toggling window. Current state: ${state.isWindowVisible ? 'visible' : 'hidden'}`);
  if (state.isWindowVisible) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

// Superadmin stealth mode — makes the window maximally invisible to the OS
function applySuperadminMode(enabled: boolean): void {
  state.superadminMode = enabled
  const win = state.mainWindow
  if (!win || win.isDestroyed()) return

  if (enabled) {
    // 1. Invisible in the taskbar / Dock
    syncWindowTaskbarState(win)

    // 2. Not visible during screen sharing / screen capture
    win.setContentProtection(true)

    // 3. Click-through when the settings dialog is not actively in use
    syncWindowInteractionState(win)

    // 4. macOS-specific: hide from Mission Control & window lists
    if (process.platform === "darwin") {
      win.setHiddenInMissionControl(true)
      win.setWindowButtonVisibility(false)
    }

    // 5. Remove from Alt-Tab / window switcher on all platforms
    win.setAlwaysOnTop(true, "screen-saver", 1)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // 6. Remove window shadow (reduces OS-level footprint)
    win.setHasShadow(false)

    // 7. Disguise process title to avoid detection in Activity / Task Manager
    try {
      win.setTitle("")
    } catch (_) { /* best-effort */ }

    console.log("Superadmin mode ENABLED – window is in full stealth")
  } else {
    // Restore normal behaviour
    syncWindowTaskbarState(win)
    if (!(isWindows && isDev)) {
      win.setContentProtection(true)
    } else {
      win.setContentProtection(false)
    }
    syncWindowInteractionState(win)

    if (process.platform === "darwin") {
      win.setHiddenInMissionControl(false)
    }

    win.setAlwaysOnTop(true, "screen-saver", 1)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setHasShadow(!isWindows)

    try {
      win.setTitle("Interview Coder")
    } catch (_) { /* best-effort */ }

    console.log("Superadmin mode DISABLED – window restored to normal")
  }

  // Persist to config
  configHelper.updateConfig({ superadminMode: enabled } as any)

  // Notify renderer
  if (!win.isDestroyed()) {
    win.webContents.send("superadmin-mode-changed", { enabled })
  }
}

function setWindowFocusable(focusable: boolean): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    try {
      state.mainWindow.setFocusable(Boolean(focusable))
      if (!focusable) {
        state.mainWindow.blur()
      }
    } catch (_) {}
  }
}

function focusMainWindow(): void {
  pruneExtraWindows()
  if (!state.mainWindow?.isDestroyed()) {
    if (!state.isWindowVisible) {
      showMainWindow()
    }

    if (state.mainWindow.isMinimized()) {
      state.mainWindow.restore()
    }

    try {
      state.mainWindow.setFocusable(true)
    } catch (_) {}
    state.mainWindow.show()
    state.mainWindow.focus()
    syncWindowStealthState(state.mainWindow)
  }
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  pruneExtraWindows()
  if (!state.mainWindow) return
  state.currentX = updateFn(state.currentX)
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  )
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  pruneExtraWindows()
  if (!state.mainWindow) return

  const newY = updateFn(state.currentY)
  // Allow window to go 2/3 off screen in either direction
  const maxUpLimit = (-(state.windowSize?.height || 0) * 2) / 3
  const maxDownLimit =
    state.screenHeight + ((state.windowSize?.height || 0) * 2) / 3

  // Log the current state and limits
  console.log({
    newY,
    maxUpLimit,
    maxDownLimit,
    screenHeight: state.screenHeight,
    windowHeight: state.windowSize?.height,
    currentY: state.currentY
  })

  // Only update if within bounds
  if (newY >= maxUpLimit && newY <= maxDownLimit) {
    state.currentY = newY
    state.mainWindow.setPosition(
      Math.round(state.currentX),
      Math.round(state.currentY)
    )
  }
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (!state.mainWindow?.isDestroyed()) {
    const [currentX, currentY] = state.mainWindow.getPosition()
    const display = screen.getDisplayMatching(state.mainWindow.getBounds())
    const workArea = display.workArea
    const maxWidth = Math.max(750, workArea.width - 32)
    const topInset = Math.max(0, currentY - workArea.y)
    const maxHeight = Math.max(520, workArea.height - topInset - 16)
    const config = configHelper.loadConfig()
    const preferredWidth = Math.min(
      Math.max(750, config.preferredWindowWidth || 800),
      maxWidth
    )
    const minimumHeight = state.view === "queue" ? 420 : 550
    const preferredHeight = Math.max(minimumHeight, config.preferredWindowHeight || 600)

    state.mainWindow.setMinimumSize(750, minimumHeight)

    // Content-driven resize should respect the user's preferred layer width.
    // We only let the height grow to fit content when needed.
    state.mainWindow.setBounds({
      x: Math.min(currentX, workArea.x + workArea.width - preferredWidth),
      y: currentY,
      width: preferredWidth,
      height: Math.min(Math.max(Math.ceil(height), minimumHeight), maxHeight)
    })
  }
}

function applyPreferredWindowDimensions(config = configHelper.loadConfig()): void {
  if (state.mainWindow?.isDestroyed() || !state.mainWindow) {
    return
  }

  const bounds = state.mainWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea
  const minimumWidth = 750
  const minimumHeight = state.view === "queue" ? 420 : 550
  const maxWidth = Math.max(minimumWidth, workArea.width - 32)
  const maxHeight = Math.max(minimumHeight, workArea.height - 16)
  const width = Math.min(
    Math.max(minimumWidth, config.preferredWindowWidth || 800),
    maxWidth
  )
  const height = Math.min(
    Math.max(minimumHeight, config.preferredWindowHeight || 600),
    maxHeight
  )
  const nextX = Math.min(
    Math.max(workArea.x, bounds.x),
    Math.max(workArea.x, workArea.x + workArea.width - width)
  )
  const nextY = Math.min(
    Math.max(workArea.y, bounds.y),
    Math.max(workArea.y, workArea.y + workArea.height - height)
  )

  state.mainWindow.setMinimumSize(minimumWidth, minimumHeight)
  state.mainWindow.setBounds({
    x: nextX,
    y: nextY,
    width,
    height
  })

  state.windowPosition = { x: nextX, y: nextY }
  state.windowSize = { width, height }
  state.currentX = nextX
  state.currentY = nextY
}

// Environment setup
function loadEnvVariables() {
  if (isDev) {
    console.log("Loading env variables from:", path.join(process.cwd(), ".env"))
    dotenv.config({ path: path.join(process.cwd(), ".env") })
  } else {
    console.log(
      "Loading env variables from:",
      path.join(process.resourcesPath, ".env")
    )
    dotenv.config({ path: path.join(process.resourcesPath, ".env") })
  }
  console.log("Environment variables loaded for open-source version")
}

// Initialize application
async function initializeApp() {
  try {
    // In Windows development, Chromium cache path overrides can trigger
    // "Unable to move the cache: Access is denied" warnings. Keep the
    // default cache/session locations there, and only customize userData.
    const shouldUseDefaultChromiumCachePaths = isDev && process.platform === "win32"
    const appDataPath = path.join(app.getPath('appData'), 'interview-coder-v1')
    const sessionPath = path.join(appDataPath, 'session')
    const tempPath = path.join(appDataPath, 'temp')
    const cachePath = path.join(appDataPath, 'cache')

    const requiredDirectories = shouldUseDefaultChromiumCachePaths
      ? [appDataPath]
      : [appDataPath, sessionPath, tempPath, cachePath]

    for (const dir of requiredDirectories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    app.setPath('userData', appDataPath)

    if (!shouldUseDefaultChromiumCachePaths) {
      app.setPath('sessionData', sessionPath)
      app.setPath('temp', tempPath)
      app.setPath('cache', cachePath)
    } else {
      console.log("Using default Chromium cache/session paths for Windows development")
    }
      
    loadEnvVariables()
    
    // Ensure a configuration file exists
    if (!configHelper.hasApiKey()) {
      console.log("No API key found in configuration. User will need to set up.")
    }
    
    initializeHelpers()
    configHelper.on("config-updated", (nextConfig) => {
      applyWindowOpacity(nextConfig.opacity ?? MAX_WINDOW_OPACITY, {
        persist: false
      })
      applyPreferredWindowDimensions(nextConfig)
    })
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      setWindowFocusable,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      focusMainWindow,
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      decreaseWindowOpacity: () => adjustWindowOpacity(-WINDOW_OPACITY_STEP),
      increaseWindowOpacity: () => adjustWindowOpacity(WINDOW_OPACITY_STEP)
    })
    await createWindow()
    state.shortcutsHelper?.registerGlobalShortcuts()

    // Register superadmin mode IPC handler
    ipcMain.handle("toggle-superadmin-mode", (_event, enabled: boolean) => {
      try {
        applySuperadminMode(enabled)
        return { success: true, enabled: state.superadminMode }
      } catch (error) {
        console.error("Error toggling superadmin mode:", error)
        return { success: false, error: "Failed to toggle superadmin mode" }
      }
    })

    ipcMain.handle("get-superadmin-mode", () => {
      return { enabled: state.superadminMode }
    })

    ipcMain.handle("set-settings-dialog-open", (_event, isOpen: boolean) => {
      state.isSettingsDialogOpen = Boolean(isOpen)
      syncWindowInteractionState(state.mainWindow)
      return { success: true, open: state.isSettingsDialogOpen }
    })

    // Restore superadmin mode from persisted config
    const savedConfig = configHelper.loadConfig()
    if (savedConfig.superadminMode) {
      applySuperadminMode(true)
    }

    // Initialize auto-updater regardless of environment
    initAutoUpdater()
    console.log(
      "Auto-updater initialized in",
      isDev ? "development" : "production",
      "mode"
    )
  } catch (error) {
    console.error("Failed to initialize application:", error)
    app.quit()
  }
}

// Auth callback handling removed - no longer needed
app.on("open-url", (event, url) => {
  console.log("open-url event received:", url)
  event.preventDefault()
})

// Prevent multiple instances of the app
if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", (event, commandLine) => {
    console.log("second-instance event received:", commandLine)

    if (!state.mainWindow) {
      createWindow()
    } else {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.showInactive()
      state.mainWindow.moveTop()
    }
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
      state.mainWindow = null
    }
  })
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

function getView(): "queue" | "solutions" | "debug" {
  return state.view
}

function setView(view: "queue" | "solutions" | "debug"): void {
  state.view = view
  state.screenshotHelper?.setView(view)
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper
}

function getProblemInfo(): any {
  return state.problemInfo
}

function setProblemInfo(problemInfo: any): void {
  state.problemInfo = problemInfo
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || []
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || []
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues()
  state.problemInfo = null
  setView("queue")
  memoryHelper.clearActiveSession()
}

async function takeScreenshot(): Promise<string> {
  if (!state.mainWindow) throw new Error("No main window available")
  return (
    state.screenshotHelper?.takeScreenshot(
      () => hideMainWindow(),
      () => showMainWindow()
    ) || ""
  )
}

async function getImagePreview(filepath: string): Promise<string> {
  return state.screenshotHelper?.getImagePreview(filepath) || ""
}

async function deleteScreenshot(
  path: string
): Promise<{ success: boolean; error?: string }> {
  return (
    state.screenshotHelper?.deleteScreenshot(path) || {
      success: false,
      error: "Screenshot helper not initialized"
    }
  )
}

function setHasDebugged(value: boolean): void {
  state.hasDebugged = value
}

function getHasDebugged(): boolean {
  return state.hasDebugged
}

// Export state and functions for other modules
export {
  state,
  createWindow,
  hideMainWindow,
  showMainWindow,
  focusMainWindow,
  toggleMainWindow,
  setWindowDimensions,
  adjustWindowOpacity,
  moveWindowHorizontal,
  moveWindowVertical,
  getMainWindow,
  getView,
  setView,
  getScreenshotHelper,
  getProblemInfo,
  setProblemInfo,
  getScreenshotQueue,
  getExtraScreenshotQueue,
  clearQueues,
  takeScreenshot,
  getImagePreview,
  deleteScreenshot,
  setHasDebugged,
  getHasDebugged
}

app.whenReady().then(initializeApp)
