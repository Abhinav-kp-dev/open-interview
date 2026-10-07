import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useToast } from "../../contexts/toast"
import { Screenshot } from "../../types/screenshots"
import { supabase } from "../../lib/supabase"
import { LanguageSelector } from "../shared/LanguageSelector"
import { COMMAND_KEY } from "../../utils/platform"

export interface SolutionCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  isProcessing: boolean
  screenshots?: Screenshot[]
  extraScreenshots?: Screenshot[]
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  showDebugMenu?: boolean
  onOpenSettings?: (section?: "ollama" | "layer") => void
}

const handleSignOut = async () => {
  try {
    localStorage.clear()
    sessionStorage.clear()

    const { error } = await supabase.auth.signOut()
    if (error) throw error
  } catch (err) {
    console.error("Error signing out:", err)
  }
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  onTooltipVisibilityChange,
  isProcessing,
  extraScreenshots = [],
  currentLanguage,
  setLanguage,
  showDebugMenu = false,
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

  useEffect(() => {
    if (onTooltipVisibilityChange) {
      onTooltipVisibilityChange(isTooltipVisible, 0)
    }
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

  const handleOpenSettings = (section: "ollama" | "layer") => {
    setIsTooltipVisible(false)
    onOpenSettings?.(section)
  }

  return (
    <div>
      <div className="w-full pt-1">
        <div className="app-toolbar text-xs text-white/90">
          <div
            className="app-tool-button cursor-pointer"
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
            <span className="text-[11px] leading-none">Show/Hide</span>
            <div className="flex gap-1">
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                {COMMAND_KEY}
              </button>
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                B
              </button>
            </div>
          </div>

          {!isProcessing && (
            <>
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
                <span className="text-[11px] leading-snug">
                  {extraScreenshots.length === 0 ? "Screenshot your code" : "Screenshot"}
                </span>
                <div className="flex gap-1">
                  <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                    {COMMAND_KEY}
                  </button>
                  <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                    H
                  </button>
                </div>
              </div>

              {showDebugMenu && extraScreenshots.length > 0 && (
                <div
                  className="app-tool-button cursor-pointer"
                  onClick={async () => {
                    try {
                      const result = await window.electronAPI.triggerProcessScreenshots({
                        mode: "debug"
                      })
                      if (!result.success) {
                        console.error("Failed to process screenshots:", result.error)
                        showToast("Error", "Failed to process screenshots", "error")
                      }
                    } catch (error) {
                      console.error("Error processing screenshots:", error)
                      showToast("Error", "Failed to process screenshots", "error")
                    }
                  }}
                >
                  <span className="text-[11px] leading-none">Debug</span>
                  <div className="flex gap-1">
                    <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                      {COMMAND_KEY}
                    </button>
                    <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                      Enter
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div
            className="app-tool-button cursor-pointer"
            onClick={async () => {
              try {
                const result = await window.electronAPI.triggerReset()
                if (!result.success) {
                  console.error("Failed to reset:", result.error)
                  showToast("Error", "Failed to reset", "error")
                }
              } catch (error) {
                console.error("Error resetting:", error)
                showToast("Error", "Failed to reset", "error")
              }
            }}
          >
            <span className="text-[11px] leading-none">Start Over</span>
            <div className="flex gap-1">
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                {COMMAND_KEY}
              </button>
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                R
              </button>
            </div>
          </div>

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
                className="w-4 h-4"
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
                        className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
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
                          <div className="flex gap-1 flex-shrink-0">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              B
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Show or hide this window.
                        </p>
                      </div>

                      {!isProcessing && (
                        <>
                          <div
                            className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
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
                              <div className="flex gap-1 flex-shrink-0">
                                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                                  {COMMAND_KEY}
                                </span>
                                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                                  H
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                              Capture additional parts of the question or your solution for debugging help.
                            </p>
                          </div>

                          {showDebugMenu && extraScreenshots.length > 0 && (
                            <div
                              className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
                              onClick={async () => {
                                try {
                                  const result = await window.electronAPI.triggerProcessScreenshots({
                                    mode: "debug"
                                  })
                                  if (!result.success) {
                                    console.error("Failed to process screenshots:", result.error)
                                    showToast("Error", "Failed to process screenshots", "error")
                                  }
                                } catch (error) {
                                  console.error("Error processing screenshots:", error)
                                  showToast("Error", "Failed to process screenshots", "error")
                                }
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span>Debug</span>
                                <div className="flex gap-1 flex-shrink-0">
                                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                                    {COMMAND_KEY}
                                  </span>
                                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                                    Enter
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                                Generate new solutions based on all previous and newly added screenshots.
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      <div
                        className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
                        onClick={async () => {
                          try {
                            const result = await window.electronAPI.triggerReset()
                            if (!result.success) {
                              console.error("Failed to reset:", result.error)
                              showToast("Error", "Failed to reset", "error")
                            }
                          } catch (error) {
                            console.error("Error resetting:", error)
                            showToast("Error", "Failed to reset", "error")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>Start Over</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              R
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/70">
                          Start fresh with a new question.
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-white/10">
                      <LanguageSelector
                        currentLanguage={currentLanguage}
                        setLanguage={setLanguage}
                      />

                      <div className="mb-3 px-2 space-y-1">
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Ollama Settings</span>
                          <button
                            className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[11px]"
                            onClick={() => handleOpenSettings("ollama")}
                          >
                            Settings
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Settings Layer</span>
                          <button
                            className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[11px]"
                            onClick={() => handleOpenSettings("layer")}
                          >
                            Settings
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Assistant Mode</span>
                          <button
                            className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[11px] uppercase"
                            onClick={handleToggleAssistantMode}
                          >
                            {assistantMode}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-white/90">
                          <span>Debug Menu</span>
                          <button
                            className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[11px] uppercase"
                            onClick={handleToggleDebugMenu}
                          >
                            {debugMenuEnabled ? "On" : "Off"}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 text-[11px] text-red-400 hover:text-red-300 transition-colors w-full"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3 h-3"
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

export default SolutionCommands
