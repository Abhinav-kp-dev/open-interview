// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { ProblemStatementData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"

const BOTTOM_SCROLL_THRESHOLD = 48

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-3">
    <h2 className="app-section-title">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Extracting problem statement...
        </p>
      </div>
      ) : (
      <div className="max-w-none text-sm leading-7 text-gray-100">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage,
  mode = "coding"
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  currentLanguage: string
  mode?: "coding" | "general"
}) => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    if (typeof content === "string") {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="relative space-y-3">
      <h2 className="app-section-title">
        {title}
      </h2>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="mt-4 flex">
            <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
              Loading solutions...
            </p>
          </div>
        </div>
      ) : mode === "general" ? (
        <div className="rounded-[1.25rem] border border-white/10 bg-black/30 p-5 text-sm leading-7 text-gray-100">
          <div className="whitespace-pre-wrap break-words">{content as string}</div>
        </div>
      ) : (
        <div className="w-full relative">
          <button
            onClick={copyToClipboard}
            className="absolute right-3 top-3 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-white transition hover:bg-slate-900"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <SyntaxHighlighter
            showLineNumbers
            language={currentLanguage == "golang" ? "go" : currentLanguage}
            style={dracula}
            customStyle={{
              maxWidth: "100%",
              margin: 0,
              padding: "1.1rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              backgroundColor: "rgba(11, 18, 30, 0.92)",
              borderRadius: "1rem",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.24)"
            }}
            wrapLongLines={true}
          >
            {content as string}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  )
}

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => {
  // Helper to ensure we have proper complexity values
  const formatComplexity = (complexity: string | null): string => {
    // Default if no complexity returned by LLM
    if (!complexity || complexity.trim() === "") {
      return "Complexity not available";
    }

    const bigORegex = /O\([^)]+\)/i;
    // Return the complexity as is if it already has Big O notation
    if (bigORegex.test(complexity)) {
      return complexity;
    }
    
    // Concat Big O notation to the complexity
    return `O(${complexity})`;
  };
  
  const formattedTimeComplexity = formatComplexity(timeComplexity);
  const formattedSpaceComplexity = formatComplexity(spaceComplexity);
  
  return (
    <div className="space-y-3">
      <h2 className="app-section-title">
        Complexity
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Calculating complexity...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-100">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Time:</strong> {formattedTimeComplexity}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-100">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Space:</strong> {formattedSpaceComplexity}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  onOpenSettings: (section?: "ollama" | "layer") => void
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage,
  onOpenSettings
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const shouldStickToBottomRef = useRef(true)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [streamingSolution, setStreamingSolution] = useState<string>("")
  const [streamingDebug, setStreamingDebug] = useState<string>("")
  const [followUpText, setFollowUpText] = useState("")
  const [debugMenuEnabled, setDebugMenuEnabled] = useState(false)
  const [responseMode, setResponseMode] = useState<"coding" | "general">("coding")

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])

  const updateStickToBottom = (element: HTMLDivElement | null) => {
    if (!element) return

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom <= BOTTOM_SCROLL_THRESHOLD
  }

  const scheduleScrollToBottom = () => {
    const element = contentRef.current
    if (!element) return

    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "auto"
      })
      scrollFrameRef.current = null
    })
  }

  useEffect(() => {
    window.electronAPI
      .getConfig()
      .then((config) => {
        setDebugMenuEnabled(Boolean(config.debugMenuEnabled))
      })
      .catch((error) => {
        console.error("Failed to load solution view config:", error)
      })
  }, [])

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        console.log("Raw screenshot data:", existing)
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        console.log("Processed screenshots:", screenshots)
        setExtraScreenshots(screenshots)
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        setExtraScreenshots([])
      }
    }

    fetchScreenshots()
  }, [solutionData])

  const { showToast } = useToast()

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
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])
        setFollowUpText("")
        setStreamingSolution("")
        setStreamingDebug("")

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onDeleteAllScreenshots(() => {
        handleDeleteAllExtraScreenshots()
      }),
      window.electronAPI.onProcessCurrentInput(() => {
        const trimmedFollowUp = followUpText.trim()

        if (extraScreenshots.length === 0 && !trimmedFollowUp) {
          showToast("No Screenshots", "There are no extra screenshots to process.", "neutral")
          return
        }

        applyImmediateGeneralProblemStatement(trimmedFollowUp)

        window.electronAPI.triggerProcessScreenshots({
          userText: trimmedFollowUp,
          mode: "solve"
        }).then((result) => {
          if (result.success) {
            setFollowUpText("")
          }
        }).catch((error) => {
          console.error("Error processing extra screenshots:", error)
          showToast("Error", "Failed to process extra screenshots.", "error")
        })
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        shouldStickToBottomRef.current = true
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        setStreamingSolution("")
      }),
      window.electronAPI.onSolutionStream((data) => {
        setStreamingSolution(data.content || "")
      }),
      window.electronAPI.onProblemExtracted((data) => {
        queryClient.setQueryData(["problem_statement"], data)
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", error, "error")
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
          response_mode?: "coding" | "general"
        } | null
        if (!solution) {
          setView("queue")
        }
        setSolutionData(solution?.code || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        setResponseMode(solution?.response_mode === "general" ? "general" : "coding")
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return
        }
        shouldStickToBottomRef.current = true
        console.log({ data })
        const solutionData = {
          code: data.code,
          thoughts: data.thoughts,
          time_complexity: data.time_complexity,
          space_complexity: data.space_complexity,
          response_mode: data.response_mode
        }

        queryClient.setQueryData(["solution"], solutionData)
        setSolutionData(solutionData.code || null)
        setThoughtsData(solutionData.thoughts || null)
        setTimeComplexityData(solutionData.time_complexity || null)
        setSpaceComplexityData(solutionData.space_complexity || null)
        setResponseMode(solutionData.response_mode === "general" ? "general" : "coding")
        setStreamingSolution("")

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const screenshots =
              existing.previews?.map((p) => ({
                id: p.path,
                path: p.path,
                preview: p.preview,
                timestamp: Date.now()
              })) || []
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        shouldStickToBottomRef.current = true
        setDebugProcessing(true)
        setStreamingDebug("")
      }),
      window.electronAPI.onDebugStream((data) => {
        setStreamingDebug(data.content || "")
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data) => {
        shouldStickToBottomRef.current = true
        queryClient.setQueryData(["new_solution"], data)
        setStreamingDebug("")
        setDebugProcessing(false)
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
          "neutral"
        )
      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [extraScreenshots, followUpText, isTooltipVisible, queryClient, setView, showToast, tooltipHeight])

  useEffect(() => {
    if ((streamingSolution || streamingDebug) && shouldStickToBottomRef.current) {
      scheduleScrollToBottom()
    }
  }, [streamingDebug, streamingSolution])

  useEffect(() => {
    if (
      shouldStickToBottomRef.current &&
      (solutionData || thoughtsData || timeComplexityData || spaceComplexityData)
    ) {
      scheduleScrollToBottom()
    }
  }, [solutionData, thoughtsData, timeComplexityData, spaceComplexityData])

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )

    const initialSolution = queryClient.getQueryData(["solution"]) as {
      code: string
      thoughts: string[]
      time_complexity: string
      space_complexity: string
      response_mode?: "coding" | "general"
    } | null

    setSolutionData(initialSolution?.code ?? null)
    setThoughtsData(initialSolution?.thoughts ?? null)
    setTimeComplexityData(initialSolution?.time_complexity ?? null)
    setSpaceComplexityData(initialSolution?.space_complexity ?? null)
    setResponseMode(initialSolution?.response_mode === "general" ? "general" : "coding")

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
          response_mode?: "coding" | "general"
        } | null

        setSolutionData(solution?.code ?? null)
        setThoughtsData(solution?.thoughts ?? null)
        setTimeComplexityData(solution?.time_complexity ?? null)
        setSpaceComplexityData(solution?.space_complexity ?? null)
        setResponseMode(solution?.response_mode === "general" ? "general" : "coding")
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const applyImmediateGeneralProblemStatement = (nextText: string) => {
    const trimmedText = nextText.trim()
    if (responseMode !== "general" || !trimmedText) {
      return
    }

    const nextProblemStatement = {
      problem_statement: trimmedText,
      constraints: "",
      example_input: "",
      example_output: ""
    }

    setProblemStatementData(nextProblemStatement)
    queryClient.setQueryData(["problem_statement"], nextProblemStatement)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot", "error")
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
      showToast("Error", "Failed to delete the screenshot", "error")
    }
  }

  const handleDeleteAllExtraScreenshots = async () => {
    if (extraScreenshots.length === 0) {
      showToast("No Screenshots", "There are no extra screenshots to delete.", "neutral")
      return
    }

    try {
      const results = await Promise.all(
        extraScreenshots.map((screenshot) =>
          window.electronAPI.deleteScreenshot(screenshot.path)
        )
      )

      if (results.some((result) => !result.success)) {
        showToast("Error", "Failed to delete all extra screenshots.", "error")
        return
      }

      setExtraScreenshots([])
      showToast("Cleared", "All extra screenshots removed.", "success")
    } catch (error) {
      console.error("Error deleting extra screenshots:", error)
      showToast("Error", "Failed to delete all extra screenshots.", "error")
    }
  }

  const handleFollowUpSubmit = async () => {
    const trimmedFollowUp = followUpText.trim()

    if (!trimmedFollowUp && extraScreenshots.length === 0) {
      showToast("No Input", "Please provide follow-up text or add a screenshot first.", "neutral")
      return
    }

    try {
      applyImmediateGeneralProblemStatement(trimmedFollowUp)

      const result = await window.electronAPI.triggerProcessScreenshots({
        userText: trimmedFollowUp,
        mode: "solve"
      })

      if (!result.success) {
        showToast("Error", result.error || "Failed to process follow-up", "error")
        return
      }

      setFollowUpText("")
    } catch (error) {
      console.error("Error processing follow-up:", error)
      showToast("Error", "Failed to process follow-up", "error")
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        <div
          ref={contentRef}
          className="app-shell app-shell-fit"
          onScroll={(event) => {
            updateStickToBottom(event.currentTarget)
          }}
        >
          <div className="app-surface space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="app-section-title">Solution View</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Review the extracted prompt, code, and complexity in one place.
              </h1>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
              The content column now stretches cleanly on small screens without crushing the code block.
            </div>
          </div>
          {/* Conditionally render the screenshot queue if solutionData is available */}
          {solutionData && (
            <div className="app-content-card">
              <div className="space-y-3">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
              </div>
            </div>
          )}

          {/* Navbar of commands with the SolutionsHelper */}
          <SolutionCommands
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isProcessing={!problemStatementData || !solutionData}
            extraScreenshots={extraScreenshots}
            credits={credits}
            currentLanguage={currentLanguage}
            setLanguage={setLanguage}
            showDebugMenu={debugMenuEnabled}
            onOpenSettings={onOpenSettings}
          />

          {/* Main Content - Modified width constraints */}
          <div className="app-content-card w-full">
              <div className="space-y-6 max-w-full">
                <ContentSection
                  title="Problem Statement"
                  content={problemStatementData?.problem_statement}
                  isLoading={!problemStatementData}
                />

                {!solutionData && (
                  <>
                    {problemStatementData && (
                      <div className="mt-4 space-y-3">
                        <div className="flex">
                          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                            Generating solutions...
                          </p>
                        </div>
                        {streamingSolution && (
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="mb-2 text-xs uppercase tracking-[0.24em] text-white/40">
                              Live Response
                            </p>
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-white/78">
                              {streamingSolution}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {solutionData && (
                  <>
                    <ContentSection
                      title={
                        responseMode === "general"
                          ? "Highlights"
                          : `My Thoughts (${COMMAND_KEY} + Arrow keys to scroll)`
                      }
                      content={
                        thoughtsData && (
                          <div className="space-y-3">
                          <div className="space-y-2">
                              {thoughtsData.map((thought, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                                >
                                  <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                                  <div>{thought}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      isLoading={!thoughtsData}
                    />

                    <SolutionSection
                      title={responseMode === "general" ? "Response" : "Solution"}
                      content={solutionData}
                      isLoading={!solutionData}
                      currentLanguage={currentLanguage}
                      mode={responseMode}
                    />

                    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="app-section-title">Follow-up Input</p>
                          <p className="mt-2 text-sm text-white/60">
                            Continue asking questions about this solution without resetting. You can use text only or add new screenshots.
                          </p>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                          {followUpText.trim().length} chars
                        </div>
                      </div>

                      <div className="space-y-3">
                        <textarea
                          value={followUpText}
                          onChange={(e) => setFollowUpText(e.target.value)}
                          placeholder="Type a follow-up question, ask for solution revisions, or add new context here..."
                          className="min-h-[120px] w-full resize-y rounded-[1.25rem] border border-white/10 bg-black/35 px-4 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-200/30"
                        />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-white/45">
                            Use the screenshot button in the toolbar to add new images, then submit your follow-up here.
                          </p>
                          <button
                            type="button"
                            onClick={handleFollowUpSubmit}
                            disabled={!followUpText.trim() && extraScreenshots.length === 0}
                            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Send Follow-up
                          </button>
                        </div>
                      </div>
                    </div>

                    {responseMode === "coding" && (
                      <ComplexitySection
                        timeComplexity={timeComplexityData}
                        spaceComplexity={spaceComplexityData}
                        isLoading={!timeComplexityData || !spaceComplexityData}
                      />
                    )}

                    {debugProcessing && streamingDebug && (
                      <div className="space-y-3">
                        <h2 className="app-section-title">Live Debug Stream</h2>
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-white/78">
                            {streamingDebug}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
          </div>
        </div>
      </div>
      )}
    </>
  )
}

export default Solutions
