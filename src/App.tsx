import SubscribedApp from "./_pages/SubscribedApp"
import { UpdateNotification } from "./components/UpdateNotification"
import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query"
import { useEffect, useState, useCallback, useRef, type CSSProperties } from "react"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { SettingsDialog } from "./components/Settings/SettingsDialog"

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
})

// Root component that provides the QueryClient
function App() {
  const [toastState, setToastState] = useState({
    open: false,
    title: "",
    description: "",
    variant: "neutral" as "neutral" | "success" | "error"
  })
  const [credits, setCredits] = useState<number>(999) // Unlimited credits
  const [currentLanguage, setCurrentLanguage] = useState<string>("python")
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [initialView, setInitialView] = useState<"queue" | "solutions" | "debug">("queue")
  // Note: Model selection is now handled via separate extraction/solution/debugging model settings

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<"ollama" | "layer">("ollama")
  const [uiOpacity, setUiOpacity] = useState(1)
  const controlPressedRef = useRef(false)
  const metaPressedRef = useRef(false)

  const findScrollableTarget = useCallback((deltaY: number): HTMLElement | null => {
    const canScroll = (element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      const overflowY = style.overflowY
      const isScrollable =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        element.scrollHeight > element.clientHeight + 4

      if (!isScrollable) return false

      if (deltaY < 0) {
        return element.scrollTop > 0
      }

      return element.scrollTop + element.clientHeight < element.scrollHeight
    }

    const getScrollableAncestor = (node: Element | null): HTMLElement | null => {
      let current = node
      while (current && current instanceof HTMLElement) {
        if (canScroll(current)) {
          return current
        }
        current = current.parentElement
      }
      return null
    }

    const activeScrollable = getScrollableAncestor(document.activeElement)
    if (activeScrollable) {
      return activeScrollable
    }

    const elementAtCenter = document.elementFromPoint(
      Math.round(window.innerWidth / 2),
      Math.round(window.innerHeight / 2)
    )
    const centeredScrollable = getScrollableAncestor(elementAtCenter)
    if (centeredScrollable) {
      return centeredScrollable
    }

    const scrollableCandidates = Array.from(
      document.querySelectorAll<HTMLElement>("*")
    ).filter((element) => {
      const rect = element.getBoundingClientRect()
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight

      return isVisible && canScroll(element)
    })

    if (scrollableCandidates.length > 0) {
      scrollableCandidates.sort((a, b) => {
        const aRect = a.getBoundingClientRect()
        const bRect = b.getBoundingClientRect()
        return bRect.height - aRect.height
      })
      return scrollableCandidates[0]
    }

    return null
  }, [])

  // Set unlimited credits
  const updateCredits = useCallback(() => {
    setCredits(999) // No credit limit in this version
    window.__CREDITS__ = 999
  }, [])

  // Helper function to safely update language
  const updateLanguage = useCallback((newLanguage: string) => {
    setCurrentLanguage(newLanguage)
    window.__LANGUAGE__ = newLanguage
  }, [])

  // Helper function to mark initialization complete
  const markInitialized = useCallback(() => {
    setIsInitialized(true)
    window.__IS_INITIALIZED__ = true
  }, [])

  // Show toast method
  const showToast = useCallback(
    (
      title: string,
      description: string,
      variant: "neutral" | "success" | "error"
    ) => {
      setToastState({
        open: true,
        title,
        description,
        variant
      })
    },
    []
  )

  // Check provider credentials/connection and prompt if not found
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const hasKey = await window.electronAPI.checkApiKey()
        setHasApiKey(hasKey)
        
        // If no API key is found, show the settings dialog after a short delay
        if (!hasKey) {
          setTimeout(() => {
            setSettingsSection("ollama")
            setIsSettingsOpen(true)
          }, 1000)
        }
      } catch (error) {
        console.error("Failed to check API key:", error)
      }
    }
    
    if (isInitialized) {
      checkApiKey()
    }
  }, [isInitialized])

  // Initialize dropdown handler
  useEffect(() => {
    if (isInitialized) {
      // Process all types of dropdown elements with a shorter delay
      const timer = setTimeout(() => {
        // Find both native select elements and custom dropdowns
        const selectElements = document.querySelectorAll('select');
        const customDropdowns = document.querySelectorAll('.dropdown-trigger, [role="combobox"], button:has(.dropdown)');
        
        // Enable native selects
        selectElements.forEach(dropdown => {
          dropdown.disabled = false;
        });
        
        // Enable custom dropdowns by removing any disabled attributes
        customDropdowns.forEach(dropdown => {
          if (dropdown instanceof HTMLElement) {
            dropdown.removeAttribute('disabled');
            dropdown.setAttribute('aria-disabled', 'false');
          }
        });
        
        console.log(`Enabled ${selectElements.length} select elements and ${customDropdowns.length} custom dropdowns`);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  // Listen for settings dialog open requests
  useEffect(() => {
    const unsubscribeSettings = window.electronAPI.onShowSettings(() => {
      console.log("Show settings dialog requested");
      setSettingsSection("ollama")
      setIsSettingsOpen(true);
    });
    
    return () => {
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    const unsubscribeScroll = window.electronAPI.onScrollContent(({ deltaY }) => {
      const target = findScrollableTarget(deltaY)

      if (target) {
        target.scrollBy({ top: deltaY, behavior: "smooth" })
        return
      }

      window.scrollBy({ top: deltaY, behavior: "smooth" })
    })

    return () => {
      unsubscribeScroll()
    }
  }, [findScrollableTarget])

  useEffect(() => {
    window.electronAPI.setSettingsDialogOpen(isSettingsOpen).catch((error: unknown) => {
      console.error("Failed to sync settings dialog state:", error)
    })
  }, [isSettingsOpen])

  useEffect(() => {
    const unsubscribeOpacity = window.electronAPI.onWindowOpacityUpdated(
      ({ opacity }) => {
        setUiOpacity(opacity)
      }
    )

    return () => {
      unsubscribeOpacity()
    }
  }, [])

  useEffect(() => {
    const handleOpacityShortcut = async (event: KeyboardEvent) => {
      if (event.type === "keyup") {
        if (event.code === "ControlLeft" || event.code === "ControlRight" || event.key === "Control") {
          controlPressedRef.current = false
        }

        if (event.code === "MetaLeft" || event.code === "MetaRight" || event.key === "Meta") {
          metaPressedRef.current = false
        }

        return
      }

      if (event.code === "ControlLeft" || event.code === "ControlRight" || event.key === "Control") {
        controlPressedRef.current = true
      }

      if (event.code === "MetaLeft" || event.code === "MetaRight" || event.key === "Meta") {
        metaPressedRef.current = true
      }

      const hasCommandOrControl =
        event.ctrlKey || event.metaKey || controlPressedRef.current || metaPressedRef.current
      if (!hasCommandOrControl) {
        return
      }

      const isDecreaseShortcut =
        event.code === "BracketLeft" ||
        event.code === "Escape" ||
        event.key === "[" ||
        event.key === "{" ||
        event.key === "Escape" ||
        event.key === "Esc" ||
        event.keyCode === 219 ||
        event.keyCode === 27
      const isIncreaseShortcut =
        event.code === "BracketRight" ||
        event.key === "]" ||
        event.key === "}" ||
        event.keyCode === 221

      if (!isDecreaseShortcut && !isIncreaseShortcut) {
        return
      }

      event.preventDefault()

      try {
        if (isDecreaseShortcut) {
          await window.electronAPI.decreaseWindowOpacity()
          return
        }

        await window.electronAPI.increaseWindowOpacity()
      } catch (error) {
        console.error("Failed to handle opacity shortcut in renderer:", error)
      }
    }

    window.addEventListener("keydown", handleOpacityShortcut)
    window.addEventListener("keyup", handleOpacityShortcut)

    return () => {
      window.removeEventListener("keydown", handleOpacityShortcut)
      window.removeEventListener("keyup", handleOpacityShortcut)
    }
  }, [])

  // Initialize basic app state
  useEffect(() => {
    // Load config and set values
    const initializeApp = async () => {
      try {
        // Set unlimited credits
        updateCredits()
        
        // Load config including language and model settings
        const config = await window.electronAPI.getConfig()
        const memoryState = await window.electronAPI.getMemoryState()
        setUiOpacity(config?.opacity ?? 1)
        
        // Load language preference
        if (config && config.language) {
          updateLanguage(config.language)
        } else {
          updateLanguage("python")
        }

        if (memoryState?.activeSession?.problemInfo) {
          queryClient.setQueryData(["problem_statement"], memoryState.activeSession.problemInfo)
          setInitialView("solutions")
        }

        if (memoryState?.activeSession?.solution) {
          queryClient.setQueryData(["solution"], memoryState.activeSession.solution)
          setInitialView("solutions")
        }

        if (memoryState?.activeSession?.debug) {
          queryClient.setQueryData(["new_solution"], memoryState.activeSession.debug)
          setInitialView("solutions")
        }
        
        // Model settings are now managed through the settings dialog
        // and stored in config as extractionModel, solutionModel, and debuggingModel
        
        markInitialized()
      } catch (error) {
        console.error("Failed to initialize app:", error)
        // Fallback to defaults
        updateLanguage("python")
        markInitialized()
      }
    }
    
    initializeApp()

    // Event listeners for process events
    const onApiKeyInvalid = () => {
      showToast(
        "Ollama Unavailable",
        "Your Ollama connection looks unavailable. Please check your local Ollama settings.",
        "error"
      )
      setSettingsSection("ollama")
      setIsSettingsOpen(true)
    }

    // Setup API key invalid listener
    window.electronAPI.onApiKeyInvalid(onApiKeyInvalid)

    // Define a no-op handler for solution success
    const unsubscribeSolutionSuccess = window.electronAPI.onSolutionSuccess(
      () => {
        console.log("Solution success - no credits deducted in this version")
        // No credit deduction in this version
      }
    )

    // Cleanup function
    return () => {
      window.electronAPI.removeListener("API_KEY_INVALID", onApiKeyInvalid)
      unsubscribeSolutionSuccess()
      window.__IS_INITIALIZED__ = false
      setIsInitialized(false)
    }
  }, [updateCredits, updateLanguage, markInitialized, showToast])

  // API Key dialog management
  const handleOpenSettings = useCallback((section?: "ollama" | "layer" | unknown) => {
    console.log('Opening settings dialog', section);
    const validSection = section === "layer" ? "layer" : "ollama";
    setSettingsSection(validSection);
    setIsSettingsOpen(true);
  }, []);
  
  const handleCloseSettings = useCallback((open: boolean) => {
    console.log('Settings dialog state changed:', open);
    setIsSettingsOpen(open);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ToastContext.Provider value={{ showToast }}>
          <div
            className="relative app-opacity-shell"
            style={{ "--app-ui-opacity": uiOpacity } as CSSProperties}
          >
            {isInitialized ? (
              hasApiKey ? (
                <SubscribedApp
                  credits={credits}
                  currentLanguage={currentLanguage}
                  setLanguage={updateLanguage}
                  initialView={initialView}
                  onOpenSettings={handleOpenSettings}
                />
              ) : (
                <WelcomeScreen onOpenSettings={handleOpenSettings} />
              )
            ) : (
              <div className="app-shell flex items-center justify-center">
                <div className="app-surface">
                  <div className="app-panel mx-auto flex max-w-sm flex-col items-center gap-3 rounded-[28px] px-8 py-10 text-center">
                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                    <p className="text-sm text-white/60">
                    Initializing...
                    </p>
                  </div>
                </div>
              </div>
            )}
            <UpdateNotification />
          </div>
          
          {/* Settings Dialog */}
          <SettingsDialog 
            open={isSettingsOpen} 
            onOpenChange={handleCloseSettings} 
            initialSection={settingsSection}
          />
          
          <Toast
            open={toastState.open}
            onOpenChange={(open) =>
              setToastState((prev) => ({ ...prev, open }))
            }
            variant={toastState.variant}
            duration={1500}
          >
            <ToastTitle>{toastState.title}</ToastTitle>
            <ToastDescription>{toastState.description}</ToastDescription>
          </Toast>
          <ToastViewport />
        </ToastContext.Provider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
