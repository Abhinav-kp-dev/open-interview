import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import QueueCommands from "../components/Queue/QueueCommands"

import { useToast } from "../contexts/toast"
import { Screenshot } from "../types/screenshots"

async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const existing = await window.electronAPI.getScreenshots()
    return existing
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

interface QueueProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  onOpenSettings: (section?: "ollama" | "layer") => void
}

const Queue: React.FC<QueueProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage,
  onOpenSettings
}) => {
  const { showToast } = useToast()

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const [promptText, setPromptText] = useState("")
  const contentRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let isMounted = true

    window.electronAPI
      .getMemoryState()
      .then((memoryState) => {
        if (!isMounted) return
        const savedDraft = memoryState?.activeSession?.promptDraft || ""
        if (savedDraft) {
          setPromptText(savedDraft)
        }
      })
      .catch((error) => {
        console.error("Failed to load prompt draft:", error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.electronAPI.savePromptDraft(promptText).catch((error) => {
        console.error("Failed to save prompt draft:", error)
      })
    }, 250)

    return () => {
      window.clearTimeout(timer)
    }
  }, [promptText])

  const {
    data: screenshots = [],
    refetch
  } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch() // Refetch screenshots instead of managing state directly
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  const handleDeleteAllScreenshots = async () => {
    if (screenshots.length === 0) {
      showToast("No Screenshots", "There are no screenshots to delete", "neutral")
      return
    }

    try {
      const results = await Promise.all(
        screenshots.map((screenshot) =>
          window.electronAPI.deleteScreenshot(screenshot.path)
        )
      )

      if (results.some((result) => !result.success)) {
        showToast("Error", "Failed to delete all screenshots", "error")
        return
      }

      refetch()
      showToast("Cleared", "All screenshots removed", "success")
    } catch (error) {
      console.error("Error deleting all screenshots:", error)
      showToast("Error", "Failed to delete all screenshots", "error")
    }
  }

  const handleClearTextInput = () => {
    if (!promptText.trim()) {
      showToast("No Text", "There is no text input to clear", "neutral")
      return
    }

    setPromptText("")
    showToast("Cleared", "Text input removed", "success")
  }

  const handleFocusPromptInput = () => {
    try {
      window.electronAPI?.setWindowFocusable?.(true)
    } catch (_) {}
    const promptInput = promptInputRef.current
    if (!promptInput) return

    promptInput.focus()
    const cursorPosition = promptInput.value.length
    promptInput.setSelectionRange(cursorPosition, cursorPosition)
  }

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => {
        setPromptText("")
        window.electronAPI.savePromptDraft("").catch((error) => {
          console.error("Failed to clear prompt draft:", error)
        })
        refetch()
      }),
      window.electronAPI.onDeleteAllScreenshots(() => {
        handleDeleteAllScreenshots()
      }),
      window.electronAPI.onClearTextInput(() => {
        handleClearTextInput()
      }),
      window.electronAPI.onProcessCurrentInput(() => {
        handleProcess()
      }),
      window.electronAPI.onFocusPromptInput(() => {
        handleFocusPromptInput()
      }),
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue") // Revert to queue if processing fails
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight, screenshots, promptText])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const hasTextPrompt = promptText.trim().length > 0
  const canProcess = screenshots.length > 0 || hasTextPrompt

  const handleProcess = async () => {
    const trimmedPrompt = promptText.trim()
    await window.electronAPI.savePromptDraft(trimmedPrompt).catch((error) => {
      console.error("Failed to persist prompt before processing:", error)
    })

    try {
      window.electronAPI?.setWindowFocusable?.(false)
    } catch (_) {}

    const result = await window.electronAPI.triggerProcessScreenshots({
      userText: trimmedPrompt
    })

    if (!result.success) {
      console.error("Failed to process screenshots/text:", result.error)
      showToast("Error", result.error || "Failed to process input", "error")
      return
    }
  }

  const handleTerminate = async () => {
    const result = await window.electronAPI.terminateProcessing()
    if (!result.success) {
      showToast("Error", result.error || "Failed to terminate processing", "error")
      return
    }
    showToast("Terminated", "Active model processing was stopped.", "neutral")
  }
  
  return (
    <div ref={contentRef} className="app-shell app-shell-fit">
      <div className="app-surface">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="app-section-title">Workspace</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Capture the problem, then generate a solution.
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm text-white/70 backdrop-blur-xl sm:block">
                Up to 5 screenshots stay visible as a compact strip.
              </div>
              <button
                type="button"
                onClick={() => onOpenSettings("ollama")}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/20 active:scale-95"
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
                  className="h-4 w-4 text-cyan-300"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Settings
              </button>
            </div>
          </div>

          <div className="app-content-card space-y-4">
            <div className="space-y-3">
          <ScreenshotQueue
            isLoading={false}
            screenshots={screenshots}
            onDeleteScreenshot={handleDeleteScreenshot}
          />
            </div>

            <div className="rounded-[1.4rem] border border-white/15 bg-white/[0.05] p-4 backdrop-blur-2xl sm:p-5">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="app-section-title">Prompt Input</p>
                  <p className="mt-2 text-sm text-white/60">
                    Type a problem statement or additional context as in a chatbot. Can be used alone or combined with screenshots.
                  </p>
                </div>
                <div className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-xs text-white/60 backdrop-blur-xl">
                  {promptText.trim().length} chars
                </div>
              </div>

              <div className="space-y-3">
                <textarea
                  ref={promptInputRef}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onFocus={() => {
                    try {
                      window.electronAPI?.setWindowFocusable?.(true)
                    } catch (_) {}
                  }}
                  onBlur={() => {
                    try {
                      window.electronAPI?.setWindowFocusable?.(false)
                    } catch (_) {}
                  }}
                  placeholder="Paste problem statement, constraints, examples, or your questions here..."
                  className="min-h-[140px] w-full resize-y rounded-[1.25rem] border border-white/15 bg-black/20 px-4 py-4 text-sm leading-7 text-white outline-none backdrop-blur-xl transition placeholder:text-white/35 focus:border-cyan-200/30"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-white/45">
                    Input is sent directly to the model. Use <span className="font-mono">Ctrl+. / Cmd+.</span> or the terminate button to stop processing at any time.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleTerminate}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/10"
                    >
                      Terminate
                    </button>
                    <button
                      type="button"
                      onClick={handleProcess}
                      disabled={!canProcess}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send Prompt
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <QueueCommands
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              screenshotCount={screenshots.length}
              credits={credits}
              currentLanguage={currentLanguage}
              setLanguage={setLanguage}
              canProcess={canProcess}
              onProcess={handleProcess}
              onClearTextInput={handleClearTextInput}
              onDeleteAllScreenshots={handleDeleteAllScreenshots}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Queue
