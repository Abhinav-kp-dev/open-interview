import { globalShortcut, app } from "electron"
import { IShortcutsHelperDeps } from "./main"

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps
  private readonly scrollStep = 120

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  private registerShortcut(
    accelerator: string,
    callback: Parameters<typeof globalShortcut.register>[1]
  ): void {
    const registered = globalShortcut.register(accelerator, callback)
    if (!registered) {
      console.error(`Failed to register global shortcut: ${accelerator}`)
    }
  }

  private decreaseOpacity(): void {
    const nextOpacity = this.deps.decreaseWindowOpacity()
    if (nextOpacity !== null) {
      console.log(`Window opacity decreased to ${nextOpacity}`)
    }
  }

  private increaseOpacity(): void {
    const nextOpacity = this.deps.increaseWindowOpacity()
    if (nextOpacity !== null) {
      console.log(`Window opacity increased to ${nextOpacity}`)
    }
  }

  private sendScrollEvent(deltaY: number): void {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    mainWindow.webContents.send("scroll-content", { deltaY })
  }

  public registerGlobalShortcuts(): void {
    this.registerShortcut("CommandOrControl+H", async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.deps.takeScreenshot()
          const preview = await this.deps.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    this.registerShortcut("CommandOrControl+Enter", async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("process-current-input")
      }
    })

    this.registerShortcut("CommandOrControl+.", () => {
      console.log("Command/Ctrl + . pressed. Terminating active processing.")
      this.deps.processingHelper?.cancelOngoingRequests()
    })

    this.registerShortcut("CommandOrControl+Backspace", () => {
      console.log("Command/Ctrl + Backspace pressed. Clearing text input.")
      if (this.deps.getView() !== "queue") return
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("clear-text-input")
      }
    })

    this.registerShortcut("CommandOrControl+/", () => {
      console.log("Command/Ctrl + / pressed. Focusing prompt input.")
      if (this.deps.getView() !== "queue") return

      this.deps.focusMainWindow()

      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("focus-prompt-input")
      }
    })

    this.registerShortcut("CommandOrControl+R", () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.deps.processingHelper?.cancelOngoingRequests()

      // Clear both screenshot queues
      this.deps.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.deps.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }
    })

    // New shortcuts for moving the window
    this.registerShortcut("CommandOrControl+Left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    })

    this.registerShortcut("CommandOrControl+Right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    })

    this.registerShortcut("CommandOrControl+Down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.deps.moveWindowDown()
    })

    this.registerShortcut("CommandOrControl+Up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.deps.moveWindowUp()
    })

    this.registerShortcut("Alt+Up", () => {
      console.log("Alt + Up pressed. Scrolling content up.")
      this.sendScrollEvent(-this.scrollStep)
    })

    this.registerShortcut("Alt+Down", () => {
      console.log("Alt + Down pressed. Scrolling content down.")
      this.sendScrollEvent(this.scrollStep)
    })

    this.registerShortcut("CommandOrControl+B", () => {
      console.log("Command/Ctrl + B pressed. Toggling window visibility.")
      this.deps.toggleMainWindow()
    })

    this.registerShortcut("CommandOrControl+W", () => {
      console.log("Command/Ctrl + W pressed. Focusing application window.")
      this.deps.focusMainWindow()
    })

    this.registerShortcut("CommandOrControl+Q", () => {
      console.log("Command/Ctrl + Q pressed. Quitting application.")
      app.quit()
    })

    // Adjust opacity shortcuts
    this.registerShortcut("CommandOrControl+[", () => {
      console.log("Command/Ctrl + [ pressed. Decreasing opacity.")
      this.decreaseOpacity()
    })

    this.registerShortcut("CommandOrControl+]", () => {
      console.log("Command/Ctrl + ] pressed. Increasing opacity.")
      this.increaseOpacity()
    })
    
    // Zoom controls
    this.registerShortcut("CommandOrControl+-", () => {
      console.log("Command/Ctrl + - pressed. Zooming out.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom - 0.5)
      }
    })
    
    this.registerShortcut("CommandOrControl+0", () => {
      console.log("Command/Ctrl + 0 pressed. Resetting zoom.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(0)
      }
    })
    
    this.registerShortcut("CommandOrControl+=", () => {
      console.log("Command/Ctrl + = pressed. Zooming in.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom + 0.5)
      }
    })
    
    // Delete all screenshots in the active view shortcut
    this.registerShortcut("CommandOrControl+Shift+L", () => {
      console.log("Command/Ctrl + Shift + L pressed. Deleting all screenshots.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("delete-all-screenshots")
      }
    })
    
    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
