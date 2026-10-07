import { useEffect, useMemo, useState } from "react"
import { useToast } from "../../contexts/toast"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog"
import { Input } from "../ui/input"
import { Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react"

/** Standalone inline component that toggles superadmin mode via IPC. */
function SuperadminToggle() {
  const [enabled, setEnabled] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    window.electronAPI.getSuperadminMode().then((result: { enabled: boolean }) => {
      setEnabled(result.enabled)
    }).catch(() => {})

    const unsubscribe = window.electronAPI.onSuperadminModeChanged(
      (data: { enabled: boolean }) => {
        setEnabled(data.enabled)
      }
    )
    return () => { unsubscribe() }
  }, [])

  const handleChange = async (next: boolean) => {
    try {
      const result = await window.electronAPI.toggleSuperadminMode(next)
      if (result.success) {
        setEnabled(next)
        showToast(
          next ? "Superadmin ON" : "Superadmin OFF",
          next
            ? "Stealth mode activated — window is now invisible to the system"
            : "Stealth mode deactivated — window restored to normal",
          next ? "success" : "neutral"
        )
      }
    } catch (err: unknown) {
      console.error("Superadmin toggle error:", err)
      showToast("Error", "Failed to toggle Superadmin mode", "error")
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">Superadmin</p>
          <p className="mt-1 text-xs text-white/55">
            Full stealth — invisible in taskbar, screen share, system monitor, and click-through.
          </p>
        </div>
        <select
          value={enabled ? "on" : "off"}
          onChange={(e) => handleChange(e.target.value === "on")}
          className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none sm:w-36"
        >
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </div>
    </div>
  )
}

type ApiProvider = "gemini" | "openai" | "anthropic" | "ollama"

type Config = {
  apiKey?: string
  apiProvider?: ApiProvider
  assistantMode?: "coding" | "general"
  extractionModel?: string
  solutionModel?: string
  debuggingModel?: string
  debugMenuEnabled?: boolean
  ollamaHost?: string
  preferredWindowWidth?: number
  preferredWindowHeight?: number
}

type MemoryState = {
  longTermSummary: string
  preferences: {
    preferredLanguage: string | null
    explanationStyle: "concise" | "balanced" | "detailed"
    inputStyle: "text-heavy" | "screenshot-heavy" | "mixed"
    responseTraits: string[]
    commonTopics: string[]
    debuggingFrequency: "low" | "medium" | "high"
  }
  history: Array<{ id: string }>
}

type OllamaModel = {
  name: string
  size?: number
  modifiedAt?: string
}

interface SettingsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialSection?: "ollama" | "layer"
}

const PROVIDER_OPTIONS: Array<{
  value: ApiProvider
  label: string
  badge: string
  hint: string
}> = [
  {
    value: "gemini",
    label: "Google Gemini",
    badge: "Recommended",
    hint: "High-speed reasoning with free API key from Google AI Studio."
  },
  {
    value: "openai",
    label: "OpenAI",
    badge: "Cloud",
    hint: "GPT-4o vision and coding models via OpenAI platform."
  },
  {
    value: "anthropic",
    label: "Anthropic Claude",
    badge: "Cloud",
    hint: "Claude 3.7 / 3.5 Sonnet coding models via Anthropic console."
  },
  {
    value: "ollama",
    label: "Ollama",
    badge: "Local",
    hint: "100% private, runs entirely on your local machine."
  }
]

const CLOUD_MODEL_PRESETS: Record<
  "gemini" | "openai" | "anthropic",
  { extraction: string[]; solution: string[]; debugging: string[] }
> = {
  gemini: {
    extraction: ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"],
    solution: ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"],
    debugging: ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
  },
  openai: {
    extraction: ["gpt-4o", "gpt-4o-mini"],
    solution: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    debugging: ["gpt-4o", "gpt-4o-mini"]
  },
  anthropic: {
    extraction: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    solution: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"],
    debugging: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"]
  }
}

const MODEL_FIELDS = [
  {
    key: "extractionModel" as const,
    title: "Problem Extraction",
    description: "Vision/text model used to read problem screenshots."
  },
  {
    key: "solutionModel" as const,
    title: "Solution Generation",
    description: "Primary model used to generate solutions and explanations."
  },
  {
    key: "debuggingModel" as const,
    title: "Debugging",
    description: "Model used when analyzing code and applying fixes."
  }
]

const WINDOW_SIZE_PRESETS = [
  { label: "Compact", width: 800, height: 600 },
  { label: "Balanced", width: 960, height: 720 },
  { label: "Standard", width: 1024, height: 768 },
  { label: "Wide", width: 1280, height: 720 },
  { label: "Large", width: 1280, height: 960 },
  { label: "Tall", width: 1280, height: 1080 },
  { label: "Desktop", width: 1440, height: 900 }
]

const formatModelMeta = (model: OllamaModel) => {
  const meta: string[] = []

  if (typeof model.size === "number" && Number.isFinite(model.size)) {
    const sizeGb = model.size / 1024 / 1024 / 1024
    meta.push(`${sizeGb.toFixed(sizeGb >= 10 ? 0 : 1)} GB`)
  }

  if (model.modifiedAt) {
    const date = new Date(model.modifiedAt)
    if (!Number.isNaN(date.getTime())) {
      meta.push(`updated ${date.toLocaleDateString()}`)
    }
  }

  return meta.join(" | ")
}

export function SettingsDialog({
  open: externalOpen,
  onOpenChange,
  initialSection = "ollama"
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"ollama" | "layer">("ollama")
  const [apiProvider, setApiProvider] = useState<ApiProvider>("gemini")
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [isValidatingKey, setIsValidatingKey] = useState(false)
  const [keyValidationMessage, setKeyValidationMessage] = useState<{ status: "idle" | "success" | "error"; text: string }>({ status: "idle", text: "" })

  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434")
  const [assistantMode, setAssistantMode] = useState<"coding" | "general">("coding")
  const [extractionModel, setExtractionModel] = useState("")
  const [solutionModel, setSolutionModel] = useState("")
  const [debuggingModel, setDebuggingModel] = useState("")

  useEffect(() => {
    if (initialSection === "layer") {
      setActiveTab("layer")
    } else {
      setActiveTab("ollama")
    }
  }, [initialSection, externalOpen])
  const [debugMenuEnabled, setDebugMenuEnabled] = useState(false)
  const [preferredWindowWidth, setPreferredWindowWidth] = useState(800)
  const [preferredWindowHeight, setPreferredWindowHeight] = useState(600)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState<string>("")
  const [memoryState, setMemoryState] = useState<MemoryState | null>(null)
  const { showToast } = useToast()

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
  }

  const handleProviderChange = (newProvider: ApiProvider) => {
    setApiProvider(newProvider)
    setKeyValidationMessage({ status: "idle", text: "" })
    if (newProvider === "gemini") {
      setExtractionModel("gemini-2.5-flash")
      setSolutionModel("gemini-2.5-flash")
      setDebuggingModel("gemini-2.5-flash")
    } else if (newProvider === "openai") {
      setExtractionModel("gpt-4o")
      setSolutionModel("gpt-4o")
      setDebuggingModel("gpt-4o")
    } else if (newProvider === "anthropic") {
      setExtractionModel("claude-3-7-sonnet-20250219")
      setSolutionModel("claude-3-7-sonnet-20250219")
      setDebuggingModel("claude-3-7-sonnet-20250219")
    } else if (newProvider === "ollama") {
      loadOllamaModels(ollamaHost)
    }
  }

  const handleValidateKey = async () => {
    setIsValidatingKey(true)
    setKeyValidationMessage({ status: "idle", text: "" })
    try {
      const result = await window.electronAPI.validateApiKey({
        apiKey,
        provider: apiProvider,
        ollamaHost
      })
      if (result.valid) {
        setKeyValidationMessage({ status: "success", text: "API key is valid and connected successfully!" })
      } else {
        setKeyValidationMessage({ status: "error", text: result.error || "Failed to validate API key." })
      }
    } catch (err: any) {
      setKeyValidationMessage({ status: "error", text: err?.message || "Failed to validate API key." })
    } finally {
      setIsValidatingKey(false)
    }
  }

  const loadOllamaModels = async (host: string, preferredConfig?: Config) => {
    setIsRefreshingModels(true)

    try {
      const result = await window.electronAPI.getOllamaModels(host)

      if (!result.success) {
        setModels([])
        setConnectionMessage(result.error || "Failed to fetch models from Ollama.")
        return
      }

      const nextModels = result.models || []
      setModels(nextModels)
      setConnectionMessage(
        nextModels.length > 0
          ? `Connected to Ollama. ${nextModels.length} local model(s) detected.`
          : "Connected to Ollama, but no models are currently installed."
      )

      const availableNames = new Set(nextModels.map((model) => model.name))
      const nextExtraction = preferredConfig?.extractionModel || extractionModel
      const nextSolution = preferredConfig?.solutionModel || solutionModel
      const nextDebugging = preferredConfig?.debuggingModel || debuggingModel
      const firstModel = nextModels[0]?.name || ""

      setExtractionModel(
        nextExtraction && availableNames.has(nextExtraction) ? nextExtraction : firstModel
      )
      setSolutionModel(
        nextSolution && availableNames.has(nextSolution) ? nextSolution : firstModel
      )
      setDebuggingModel(
        nextDebugging && availableNames.has(nextDebugging) ? nextDebugging : firstModel
      )
    } catch (error) {
      console.error("Failed to load Ollama models:", error)
      setModels([])
      setConnectionMessage("Failed to connect to Ollama. Make sure the local service is running.")
    } finally {
      setIsRefreshingModels(false)
    }
  }

  useEffect(() => {
    if (!externalOpen) return

    setIsLoading(true)
    window.electronAPI
      .getConfig()
      .then(async (config: Config) => {
        const nextProvider = config.apiProvider || "gemini"
        setApiProvider(nextProvider)
        setApiKey(config.apiKey || "")
        const nextHost = config.ollamaHost || "http://localhost:11434"
        setOllamaHost(nextHost)
        setAssistantMode(config.assistantMode === "general" ? "general" : "coding")
        setExtractionModel(config.extractionModel || "")
        setSolutionModel(config.solutionModel || "")
        setDebuggingModel(config.debuggingModel || "")
        setDebugMenuEnabled(Boolean(config.debugMenuEnabled))
        setPreferredWindowWidth(config.preferredWindowWidth || 800)
        setPreferredWindowHeight(config.preferredWindowHeight || 600)
        const nextMemoryState = await window.electronAPI.getMemoryState()
        setMemoryState(nextMemoryState)
        if (nextProvider === "ollama") {
          return loadOllamaModels(nextHost, config)
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load config:", error)
        showToast("Error", "Failed to load settings", "error")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [externalOpen, showToast])

  const canSave = useMemo(() => {
    if (apiProvider === "ollama") {
      return Boolean(ollamaHost.trim())
    }
    return Boolean(apiKey.trim())
  }, [apiProvider, ollamaHost, apiKey])

  const selectedWindowPreset = useMemo(() => {
    const matchedPreset = WINDOW_SIZE_PRESETS.find(
      (preset) =>
        preset.width === preferredWindowWidth &&
        preset.height === preferredWindowHeight
    )

    if (matchedPreset) {
      return `${matchedPreset.label} (${matchedPreset.width} x ${matchedPreset.height})`
    }

    return `${preferredWindowWidth} x ${preferredWindowHeight}`
  }, [preferredWindowHeight, preferredWindowWidth])

  const handleSave = async () => {
    if (!canSave) {
      showToast(
        "Incomplete",
        apiProvider === "ollama"
          ? "Please provide an Ollama host."
          : "Please provide an API key.",
        "neutral"
      )
      return
    }

    setIsLoading(true)
    try {
      const result = await window.electronAPI.updateConfig({
        apiProvider,
        apiKey,
        assistantMode,
        ollamaHost,
        extractionModel,
        solutionModel,
        debuggingModel,
        debugMenuEnabled,
        preferredWindowWidth,
        preferredWindowHeight
      })

      if (result) {
        showToast(
          "Success",
          "Settings saved successfully.",
          "success"
        )
        handleOpenChange(false)
      }
    } catch (error) {
      console.error("Failed to save settings:", error)
      showToast("Error", "Failed to save settings", "error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={Boolean(externalOpen)} onOpenChange={handleOpenChange}>
      <DialogContent
        className="settings-dialog border border-white/10 bg-[rgba(5,10,20,0.94)] text-white"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(860px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          zIndex: 10050,
          margin: 0,
          padding: "24px",
          transition: "opacity 0.25s ease, transform 0.25s ease",
          animation: "fadeIn 0.25s ease forwards",
          opacity: 0.98
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-tight">
            Settings
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-white/70">
            Configure local AI models, host endpoints, display dimensions, and application behavior.
          </DialogDescription>
          <div className="mt-3 flex gap-2 border-b border-white/10 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("ollama")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                activeTab === "ollama"
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              AI Provider & Models
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("layer")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                activeTab === "layer"
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              Window & Display
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {activeTab === "ollama" && (
            <>
              {/* Provider Selection Cards */}
              <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="app-section-title text-white">AI Provider</p>
                  <span className="text-xs text-white/50">Select your preferred AI backend</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {PROVIDER_OPTIONS.map((provider) => {
                    const isSelected = apiProvider === provider.value
                    return (
                      <button
                        key={provider.value}
                        type="button"
                        onClick={() => handleProviderChange(provider.value)}
                        className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                          isSelected
                            ? "border-cyan-400/80 bg-cyan-950/40 shadow-sm"
                            : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`font-semibold text-sm ${isSelected ? "text-cyan-200" : "text-white"}`}>
                            {provider.label}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                              isSelected
                                ? "bg-cyan-400/20 text-cyan-200"
                                : "bg-white/10 text-white/60"
                            }`}
                          >
                            {provider.badge}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-white/60 leading-relaxed">
                          {provider.hint}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* API Key Configuration for Cloud Providers */}
              {apiProvider !== "ollama" && (
                <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="app-section-title text-white">API Key Configuration</p>
                      <p className="mt-1 text-xs text-white/60">
                        Paste your {apiProvider === "gemini" ? "Google Gemini" : apiProvider === "openai" ? "OpenAI" : "Anthropic Claude"} API key.
                      </p>
                    </div>
                    {apiProvider === "gemini" && (
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 underline"
                      >
                        Get Free Gemini Key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {apiProvider === "openai" && (
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 underline"
                      >
                        Get OpenAI Key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {apiProvider === "anthropic" && (
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 underline"
                      >
                        Get Anthropic Key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value)
                          setKeyValidationMessage({ status: "idle", text: "" })
                        }}
                        placeholder={
                          apiProvider === "gemini"
                            ? "AIzaSy..."
                            : apiProvider === "openai"
                              ? "sk-proj-..."
                              : "sk-ant-..."
                        }
                        className="h-11 rounded-2xl border-white/10 bg-black/50 pr-10 text-white font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                        title={showApiKey ? "Hide Key" : "Show Key"}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleValidateKey}
                      disabled={isValidatingKey || !apiKey.trim()}
                      className="h-11 rounded-2xl border-white/10 bg-white/[0.05] text-white hover:bg-white/10"
                    >
                      {isValidatingKey ? "Testing..." : "Test Key"}
                    </Button>
                  </div>

                  {keyValidationMessage.status !== "idle" && (
                    <div
                      className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs ${
                        keyValidationMessage.status === "success"
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                      }`}
                    >
                      {keyValidationMessage.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                      )}
                      <span>{keyValidationMessage.text}</span>
                    </div>
                  )}
                </div>
              )}

              {/* General Settings: Assistant Mode */}
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="space-y-2">
                  <label className="app-section-title text-white" htmlFor="assistantMode">
                    Assistant Mode
                  </label>
                  <select
                    id="assistantMode"
                    value={assistantMode}
                    onChange={(e) => setAssistantMode(e.target.value as "coding" | "general")}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-black/60 px-4 text-sm text-white outline-none"
                  >
                    <option value="coding">Coding Mode (Recommended — Solves problems, generates and debugs code)</option>
                    <option value="general">General Mode (Conversational assistant with coding support)</option>
                  </select>
                </div>
              </div>

              {/* Ollama specific controls */}
              {apiProvider === "ollama" && (
                <>
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                      <div className="flex-1 space-y-2">
                        <label className="app-section-title text-white" htmlFor="ollamaHost">
                          Ollama Host
                        </label>
                        <Input
                          id="ollamaHost"
                          value={ollamaHost}
                          onChange={(e) => setOllamaHost(e.target.value)}
                          placeholder="http://localhost:11434"
                          className="h-11 rounded-2xl border-white/10 bg-black/50 text-white"
                        />
                        <p className="text-xs text-white/55">
                          Use your local Ollama host. The default is{" "}
                          <span className="font-mono">http://localhost:11434</span>.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-2xl border-white/10 bg-white/[0.03] text-white hover:bg-white/5"
                        onClick={() => loadOllamaModels(ollamaHost)}
                        disabled={isRefreshingModels}
                      >
                        {isRefreshingModels ? "Refreshing..." : "Refresh Models"}
                      </Button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
                      {connectionMessage || "Check Ollama connection to load local models."}
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                      <div>
                        <p className="app-section-title text-white">Installed Local Models</p>
                        <p className="mt-2 text-sm text-white/60">
                          This list is loaded directly from your local Ollama instance.
                        </p>
                      </div>

                      {models.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
                          No models found. Make sure Ollama is running and pull a model, for example{" "}
                          <span className="ml-1 font-mono text-white/85">
                            ollama pull llama3.2-vision:11b
                          </span>
                          .
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {models.map((model) => (
                            <div
                              key={model.name}
                              className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
                            >
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-medium text-white">{model.name}</p>
                                <p className="text-xs text-white/45">{formatModelMeta(model)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                      <div>
                        <p className="app-section-title text-white">Model Selection</p>
                        <p className="mt-2 text-sm text-white/60">
                          Each phase uses a local model selected from your Ollama library.
                        </p>
                      </div>

                      {MODEL_FIELDS.map((field) => {
                        const value =
                          field.key === "extractionModel"
                            ? extractionModel
                            : field.key === "solutionModel"
                              ? solutionModel
                              : debuggingModel

                        const setValue =
                          field.key === "extractionModel"
                            ? setExtractionModel
                            : field.key === "solutionModel"
                              ? setSolutionModel
                              : setDebuggingModel

                        return (
                          <div key={field.key} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                            <label className="mb-1 block text-sm font-medium text-white">{field.title}</label>
                            <p className="mb-3 text-xs text-white/55">{field.description}</p>
                            <select
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none"
                              disabled={models.length === 0}
                            >
                              <option value="" disabled>
                                {models.length === 0 ? "No local model available" : "Choose a local model"}
                              </option>
                              {models.map((model) => (
                                <option key={model.name} value={model.name}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Cloud Provider Models selection */}
              {apiProvider !== "ollama" && (
                <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                  <div>
                    <p className="app-section-title text-white">Model Configuration</p>
                    <p className="mt-1 text-xs text-white/60">
                      Select or type the models used for problem extraction, solution generation, and debugging.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {MODEL_FIELDS.map((field) => {
                      const value =
                        field.key === "extractionModel"
                          ? extractionModel
                          : field.key === "solutionModel"
                            ? solutionModel
                            : debuggingModel

                      const setValue =
                        field.key === "extractionModel"
                          ? setExtractionModel
                          : field.key === "solutionModel"
                            ? setSolutionModel
                            : setDebuggingModel

                      const presets =
                        CLOUD_MODEL_PRESETS[apiProvider as "gemini" | "openai" | "anthropic"]?.[
                          field.key === "extractionModel"
                            ? "extraction"
                            : field.key === "solutionModel"
                              ? "solution"
                              : "debugging"
                        ] || []

                      return (
                        <div key={field.key} className="rounded-2xl border border-white/8 bg-black/20 p-4 space-y-2">
                          <label className="block text-sm font-medium text-white">{field.title}</label>
                          <p className="text-xs text-white/50">{field.description}</p>
                          <select
                            value={presets.includes(value) ? value : "custom"}
                            onChange={(e) => {
                              if (e.target.value !== "custom") {
                                setValue(e.target.value)
                              }
                            }}
                            className="h-10 w-full rounded-xl border border-white/10 bg-black/60 px-3 text-xs text-white outline-none"
                          >
                            {presets.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="custom">Custom Model...</option>
                          </select>
                          {(!presets.includes(value) || value === "") && (
                            <Input
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                              placeholder="Model name"
                              className="h-10 rounded-xl border-white/10 bg-black/50 text-xs text-white font-mono"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "layer" && (
            <>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="app-section-title text-white">Layer Settings</p>
                <p className="mt-2 text-sm text-white/60">
                  Choose preferred window dimensions. This preset is used at startup and serves as the minimum size when content adjusts.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                {selectedWindowPreset}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {WINDOW_SIZE_PRESETS.map((preset) => {
                const isSelected =
                  preset.width === preferredWindowWidth &&
                  preset.height === preferredWindowHeight

                return (
                  <button
                    key={`${preset.width}x${preset.height}`}
                    type="button"
                    onClick={() => {
                      setPreferredWindowWidth(preset.width)
                      setPreferredWindowHeight(preset.height)
                    }}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-cyan-200/30 bg-cyan-200/12 text-white"
                        : "border-white/10 bg-black/20 text-white/75 hover:bg-white/5"
                    }`}
                  >
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {preset.width} x {preset.height}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Debug Menu</p>
                  <p className="mt-1 text-xs text-white/55">
                    Toggle debug controls in the Solution View without disabling background functionality.
                  </p>
                </div>
                <select
                  value={debugMenuEnabled ? "on" : "off"}
                  onChange={(e) => setDebugMenuEnabled(e.target.value === "on")}
                  className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none sm:w-36"
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </div>
            </div>

            <SuperadminToggle />
          </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="app-section-title text-white">Keyboard Shortcuts</p>
                <div className="mt-4 grid grid-cols-1 gap-y-3 text-xs sm:grid-cols-2 sm:gap-x-6">
                  <div className="text-white/70">Toggle Visibility</div>
                  <div className="font-mono text-white/90">Ctrl+B / Cmd+B</div>
                  <div className="text-white/70">Focus App</div>
                  <div className="font-mono text-white/90">Ctrl+W / Cmd+W</div>
                  <div className="text-white/70">Take Screenshot</div>
                  <div className="font-mono text-white/90">Ctrl+H / Cmd+H</div>
                  <div className="text-white/70">Process Screenshots</div>
                  <div className="font-mono text-white/90">Ctrl+Enter / Cmd+Enter</div>
                  <div className="text-white/70">Clear Text Input</div>
                  <div className="font-mono text-white/90">Ctrl+Backspace / Cmd+Backspace</div>
                  <div className="text-white/70">Delete All Screenshots</div>
                  <div className="font-mono text-white/90">Ctrl+Shift+L / Cmd+Shift+L</div>
                  <div className="text-white/70">Terminate Processing</div>
                  <div className="font-mono text-white/90">Ctrl+. / Cmd+.</div>
                  <div className="text-white/70">Reset View</div>
                  <div className="font-mono text-white/90">Ctrl+R / Cmd+R</div>
                </div>
              </div>
            </>
          )}

          {activeTab === "ollama" && (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="app-section-title text-white">Personal Memory</p>
              <p className="mt-2 text-sm text-white/60">
                This summary is automatically generated from interactions stored locally on your device.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75">
                {memoryState?.longTermSummary || "Not enough history yet to form long-term memory."}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/75">
                  <div className="text-white/45">Preferred language</div>
                  <div className="mt-1 font-medium text-white">
                    {memoryState?.preferences.preferredLanguage || "Not detected yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/75">
                  <div className="text-white/45">Explanation style</div>
                  <div className="mt-1 font-medium capitalize text-white">
                    {memoryState?.preferences.explanationStyle || "balanced"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/75">
                  <div className="text-white/45">Input style</div>
                  <div className="mt-1 font-medium capitalize text-white">
                    {memoryState?.preferences.inputStyle || "mixed"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/75">
                  <div className="text-white/45">History entries</div>
                  <div className="mt-1 font-medium text-white">
                    {memoryState?.history.length || 0}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(memoryState?.preferences.responseTraits || []).map((trait) => (
                  <span
                    key={trait}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                  >
                    {trait}
                  </span>
                ))}
                {(memoryState?.preferences.commonTopics || []).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-cyan-200/15 bg-cyan-200/10 px-3 py-1 text-xs text-cyan-100"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="h-11 rounded-2xl border-white/10 bg-white/[0.03] text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            className="h-11 rounded-2xl bg-white px-5 text-black transition-colors hover:bg-cyan-50"
            onClick={handleSave}
            disabled={isLoading || !canSave}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
