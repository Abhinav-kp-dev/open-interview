import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"

import { useToast } from "../../contexts/toast"
import { COMMAND_KEY } from "../../utils/platform"
import { LanguageSelector } from "../shared/LanguageSelector"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshotCount?: number
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  canProcess?: boolean
  onProcess?: () => Promise<void> | void
  onClearTextInput?: () => void
  onDeleteAllScreenshots?: () => Promise<void> | void
  onOpenSettings?: (section?: "ollama" | "layer") => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshotCount = 0,
  credits,
  currentLanguage,
  setLanguage,
  canProcess = false,
  onProcess,
  onClearTextInput,
  onDeleteAllScreenshots,
  onOpenSettings
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [assistantMode, setAssistantMode] = useState<"coding" | "general">("coding")
  const [debugMenuEnabled, setDebugMenuEnabled] = useState(false)
  const [tooltipPlacement, setTooltipPlacement] = useState<"top" | "bottom">("bottom")
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const extractLanguagesAndUpdate = (direction?: "next" | "prev") => {
    const hiddenRenderContainer = document.createElement("div")
    hiddenRenderContainer.style.position = "absolute"
    hiddenRenderContainer.style.left = "-9999px"
    document.body.appendChild(hiddenRenderContainer)

    const root = createRoot(hiddenRenderContainer)
    root.render(
      <LanguageSelector currentLanguage={currentLanguage} setLanguage={() => {}} />
    )

    setTimeout(() => {
      const selectElement = hiddenRenderContainer.querySelector("select")
      if (selectElement) {
        const options = Array.from(selectElement.options)
        const values = options.map((opt) => opt.value)
        const currentIndex = values.indexOf(currentLanguage)
        let newIndex = currentIndex

        if (direction === "prev") {
          newIndex = (currentIndex - 1 + values.length) % values.length
        } else {
          newIndex = (currentIndex + 1) % values.length
        }

        if (newIndex !== currentIndex) {
          setLanguage(values[newIndex])
          window.electronAPI.updateConfig({ language: values[newIndex] })
        }
      }

      root.unmount()
      document.body.removeChild(hiddenRenderContainer)
    }, 50)
  }

  useEffect(() => {
    onTooltipVisibilityChange(isTooltipVisible, 0)
  }, [isTooltipVisible, onTooltipVisibilityChange])

  useEffect(() => {
    if (!isTooltipVisible) return

    window.electronAPI
      .getConfig()
      .then((config) => {
        setAssistantMode(config.assistantMode === "general" ? "general" : "coding")
        setDebugMenuEnabled(Boolean(config.debugMenuEnabled))
      })
      .catch((error) => {
        console.error("Failed to load dropdown settings:", error)
      })

    const updatePlacement = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      const tooltipHeight = tooltipRef.current?.offsetHeight ?? 0
      const tooltipWidth = tooltipRef.current?.offsetWidth ?? 0
      if (!triggerRect || tooltipHeight === 0 || tooltipWidth === 0) return

      const spaceBelow = window.innerHeight - triggerRect.bottom
      const spaceAbove = triggerRect.top
      const shouldOpenTop =
        spaceBelow < tooltipHeight + 24 && spaceAbove > spaceBelow

      const nextPlacement = shouldOpenTop ? "top" : "bottom"
      const top = shouldOpenTop
        ? Math.max(12, triggerRect.top - tooltipHeight - 12)
        : Math.min(window.innerHeight - tooltipHeight - 12, triggerRect.bottom + 12)
      const left = Math.max(
        12,
        Math.min(window.innerWidth - tooltipWidth - 12, triggerRect.right - tooltipWidth)
      )

      setTooltipPlacement(nextPlacement)
      setTooltipStyle({
        position: "fixed",
        top,
        left,
        zIndex: 10030
      })
    }

    updatePlacement()
    const frame = window.requestAnimationFrame(updatePlacement)
    window.addEventListener("resize", updatePlacement)
    window.addEventListener("scroll", updatePlacement, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", updatePlacement)
      window.removeEventListener("scroll", updatePlacement, true)
    }
  }, [isTooltipVisible])

  useEffect(() => {
    if (!isTooltipVisible) return

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      if (tooltipRef.current?.contains(event.target as Node)) return
      setIsTooltipVisible(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTooltipVisible(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isTooltipVisible])

  const handleSignOut = async () => {
    try {
      localStorage.clear()
      sessionStorage.clear()

      await window.electronAPI.updateConfig({
        apiKey: ""
      })

      showToast("Success", "Logged out successfully", "success")

      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error("Error logging out:", err)
      showToast("Error", "Failed to log out", "error")
    }
  }

  const handleOpenSettings = (section: "ollama" | "layer") => {
    setIsTooltipVisible(false)
    onOpenSettings?.(section)
  }

  const handleToggleAssistantMode = async () => {
    const nextMode = assistantMode === "coding" ? "general" : "coding"

    try {
      await window.electronAPI.updateConfig({
        assistantMode: nextMode
      })
      setAssistantMode(nextMode)
      showToast("Success", `Assistant Mode: ${nextMode}`, "success")
    } catch (error) {
      console.error("Failed to update assistant mode:", error)
      showToast("Error", "Failed to update assistant mode", "error")
    }
  }

  const handleToggleDebugMenu = async () => {
    const nextValue = !debugMenuEnabled

    try {
      await window.electronAPI.updateConfig({
        debugMenuEnabled: nextValue
      })
      setDebugMenuEnabled(nextValue)
      showToast("Success", `Debug Menu: ${nextValue ? "On" : "Off"}`, "success")
    } catch (error) {
      console.error("Failed to update debug menu setting:", error)
      showToast("Error", "Failed to update debug menu setting", "error")
    }
  }

  return (
    <div>
      <div className="w-full pt-1">
        <div className="app-toolbar text-xs text-white/90">
          <div
            className="app-tool-button cursor-pointer"
            onClick={async () => {
              try {
                const result = await window.electronAPI.triggerScreenshot()
                if (!result.success) {
                  console.error("Failed to take screenshot:", result.error)
                  showToast("Error", "Failed to take screenshot", "error")
                }
              } catch (error) {
                console.error("Error taking screenshot:", error)
                showToast("Error", "Failed to take screenshot", "error")
              }
            }}
          >
            <span className="text-left text-[11px] leading-snug">
              {screenshotCount === 0
                ? "Take first screenshot"
                : screenshotCount === 1
                  ? "Take second screenshot"
                  : screenshotCount === 2
                    ? "Take third screenshot"
                    : screenshotCount === 3
                      ? "Take fourth screenshot"
                      : screenshotCount === 4
                        ? "Take fifth screenshot"
                        : "Next will replace first screenshot"}
            </span>
            <div className="flex gap-1">
              <button className="app-kbd">{COMMAND_KEY}</button>
              <button className="app-kbd">H</button>
            </div>
          </div>

          {canProcess && (
            <div
              className={`app-tool-button cursor-pointer ${
                credits <= 0 ? "opacity-50 cursor-not-allowed" : ""
              }`}
              onClick={async () => {
                try {
                  await onProcess?.()
                } catch (error) {
                  console.error("Error processing screenshots:", error)
                  showToast("Error", "Failed to process screenshots", "error")
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] leading-none">Solve</span>
                <div className="ml-2 flex gap-1">
                  <button className="rounded-md bg-white/10 px-1.5 py-1 text-[11px] leading-none text-white/70">
                    {COMMAND_KEY}
                  </button>
                  <button className="rounded-md bg-white/10 px-1.5 py-1 text-[11px] leading-none text-white/70">
                    Enter
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mx-1 hidden h-12 w-px self-center bg-white/12 lg:block" />

          <button
            type="button"
            onClick={() => onOpenSettings?.("ollama")}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
            title="Open Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-cyan-300"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Settings</span>
          </button>

          <div
            ref={menuRef}
            className="relative inline-block"
          >
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={isTooltipVisible}
              aria-label="Open shortcuts and settings menu"
              onClick={() => setIsTooltipVisible((visible) => !visible)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              title="More Options & Shortcuts"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            {isTooltipVisible &&
              createPortal(
                <div
                  ref={tooltipRef}
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  style={tooltipStyle}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="max-h-[min(32rem,calc(100vh-7rem))] overflow-y-auto rounded-3xl border border-white/10 bg-[rgba(7,13,24,0.96)] p-4 text-xs text-white/90 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                    <div className="space-y-4">
                      <h3 className="font-medium text-white">Keyboard Shortcuts</h3>
                      <div className="space-y-3">
                      <div
                        className="cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10"
                        onClick={() => window.electronAPI.toggleMainWindow()}
                      >
                        <div className="flex items-center justify-between">
                          <span>Focus App</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              W
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Bring the app to the front and focus it.
                        </p>
                      </div>

                      <div
                        className="cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10"
                        onClick={async () => {
                          try {
                            const result = await window.electronAPI.toggleMainWindow()
                            if (!result.success) {
                              console.error("Failed to toggle window:", result.error)
                              showToast("Error", "Failed to toggle window", "error")
                            }
                          } catch (error) {
                            console.error("Error toggling window:", error)
                            showToast("Error", "Failed to toggle window", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Toggle Window</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              B
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Show or hide this window.
                        </p>
                      </div>

                      <div
                        className="cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10"
                        onClick={async () => {
                          try {
                            const result = await window.electronAPI.triggerScreenshot()
                            if (!result.success) {
                              console.error("Failed to take screenshot:", result.error)
                              showToast("Error", "Failed to take screenshot", "error")
                            }
                          } catch (error) {
                            console.error("Error taking screenshot:", error)
                            showToast("Error", "Failed to take screenshot", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Take Screenshot</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              H
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Take a screenshot of the problem description.
                        </p>
                      </div>

                      <div
                        className={`cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10 ${
                          canProcess ? "" : "cursor-not-allowed opacity-50"
                        }`}
                        onClick={async () => {
                          if (!canProcess) return

                          try {
                            await onProcess?.()
                          } catch (error) {
                            console.error("Error processing screenshots:", error)
                            showToast("Error", "Failed to process screenshots", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Solve</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              Enter
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          {canProcess
                            ? "Generate a solution based on screenshots and/or typed prompt."
                            : "Add a screenshot or type a prompt first."}
                        </p>
                      </div>

                      <div
                        className="cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10"
                        onClick={async () => {
                          try {
                            const result = await window.electronAPI.terminateProcessing()
                            if (!result.success) {
                              showToast("Error", result.error || "Failed to terminate processing", "error")
                            }
                          } catch (error) {
                            console.error("Error terminating processing:", error)
                            showToast("Error", "Failed to terminate processing", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Terminate Processing</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              .
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Stop the current model request immediately.
                        </p>
                      </div>

                      <div
                        className="cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10"
                        onClick={() => {
                          onClearTextInput?.()
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Clear Text Input</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              Backspace
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Clear the typed prompt without removing screenshots.
                        </p>
                      </div>

                      <div
                        className={`cursor-pointer rounded px-2 py-1.5 transition-colors hover:bg-white/10 ${
                          screenshotCount > 0 ? "" : "cursor-not-allowed opacity-50"
                        }`}
                        onClick={async () => {
                          if (screenshotCount === 0) return

                          try {
                            await onDeleteAllScreenshots?.()
                          } catch (error) {
                            console.error("Error deleting screenshots:", error)
                            showToast("Error", "Failed to delete screenshots", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Delete All Screenshots</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                              Shift+L
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          {screenshotCount > 0
                            ? "Remove every screenshot from the current queue."
                            : "No screenshots to delete."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="mb-3 px-2">
                        <div
                          className="flex cursor-pointer items-center justify-between rounded px-2 py-1 transition-colors hover:bg-white/10"
                          onClick={() => extractLanguagesAndUpdate("next")}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                              extractLanguagesAndUpdate("prev")
                            } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                              extractLanguagesAndUpdate("next")
                            }
                          }}
                        >
                          <span className="text-[11px] text-white/70">Language</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/90">{currentLanguage}</span>
                            <div className="text-[8px] text-white/40">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3 w-3"
                              >
                                <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mb-3 space-y-1 px-2">
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Ollama Settings</span>
                          <button
                            className="rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
                            onClick={() => handleOpenSettings("ollama")}
                          >
                            Settings
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Settings Layer</span>
                          <button
                            className="rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
                            onClick={() => handleOpenSettings("layer")}
                          >
                            Settings
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Assistant Mode</span>
                          <button
                            className="rounded bg-white/10 px-2 py-1 text-[11px] uppercase hover:bg-white/20"
                            onClick={handleToggleAssistantMode}
                          >
                            {assistantMode}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Debug Menu</span>
                          <button
                            className="rounded bg-white/10 px-2 py-1 text-[11px] uppercase hover:bg-white/20"
                            onClick={handleToggleDebugMenu}
                          >
                            {debugMenuEnabled ? "On" : "Off"}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 text-[11px] text-red-400 transition-colors hover:text-red-300"
                      >
                        <div className="flex h-4 w-4 items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-3 w-3"
                          >
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                          </svg>
                        </div>
                        Log Out
                      </button>
                    </div>
                  </div>
                </div>
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QueueCommands
