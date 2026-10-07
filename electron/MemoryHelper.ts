import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { app } from "electron"

export interface MemoryProblemInfo {
  problem_statement?: string
  constraints?: string
  example_input?: string
  example_output?: string
}

export interface MemorySolution {
  code?: string
  thoughts?: string[]
  time_complexity?: string
  space_complexity?: string
}

export interface MemoryDebugSession {
  code?: string
  debug_analysis?: string
  thoughts?: string[]
  time_complexity?: string
  space_complexity?: string
}

export interface MemoryPreferences {
  preferredLanguage: string | null
  explanationStyle: "concise" | "balanced" | "detailed"
  inputStyle: "text-heavy" | "screenshot-heavy" | "mixed"
  responseTraits: string[]
  commonTopics: string[]
  debuggingFrequency: "low" | "medium" | "high"
}

export type MemoryInteractionMode = "coding" | "general"

export interface MemoryModeInsight {
  preferences: MemoryPreferences
  longTermSummary: string
}

export interface MemoryPersonalFacts {
  userName: string | null
}

interface MemoryProfile {
  id: string
  createdAt: string
  lastSeenAt: string
}

export interface MemoryHistoryEntry {
  id: string
  type: "solve" | "debug"
  mode?: MemoryInteractionMode
  createdAt: string
  userInput: string
  language?: string | null
  problemInfo?: MemoryProblemInfo | null
  solution?: MemorySolution | null
  debug?: MemoryDebugSession | null
}

interface ActiveSession {
  promptDraft: string
  problemInfo: MemoryProblemInfo | null
  solution: MemorySolution | null
  debug: MemoryDebugSession | null
  updatedAt: string | null
}

export interface MemoryState {
  version: 1
  profile: MemoryProfile
  activeSession: ActiveSession
  preferences: MemoryPreferences
  longTermSummary: string
  personalFacts?: MemoryPersonalFacts
  history: MemoryHistoryEntry[]
  modeInsights?: Record<MemoryInteractionMode, MemoryModeInsight>
}

type RetrievalMode = "extract" | "solve" | "debug"

interface RetrievalQuery {
  mode: RetrievalMode
  memoryMode?: MemoryInteractionMode
  language?: string | null
  userText?: string
  currentProblemStatement?: string
  limit?: number
}

const MAX_HISTORY_ITEMS = 50

export class MemoryHelper {
  private memoryPath: string | null = null
  private memoryDir: string | null = null
  private profilePath: string | null = null
  private activeSessionPath: string | null = null
  private historyPath: string | null = null
  private summaryPath: string | null = null

  private getDefaultState(): MemoryState {
    const now = new Date().toISOString()

    return {
      version: 1,
      profile: {
        id: randomUUID(),
        createdAt: now,
        lastSeenAt: now
      },
      activeSession: {
        promptDraft: "",
        problemInfo: null,
        solution: null,
        debug: null,
        updatedAt: null
      },
      preferences: {
        preferredLanguage: null,
        explanationStyle: "balanced",
        inputStyle: "mixed",
        responseTraits: [],
        commonTopics: [],
        debuggingFrequency: "low"
      },
      longTermSummary: "Not enough long-term memory yet to summarize.",
      personalFacts: {
        userName: null
      },
      history: [],
      modeInsights: {
        coding: {
          preferences: {
            preferredLanguage: null,
            explanationStyle: "balanced",
            inputStyle: "mixed",
            responseTraits: [],
            commonTopics: [],
            debuggingFrequency: "low"
          },
          longTermSummary: "Not enough coding memory yet to summarize."
        },
        general: {
          preferences: {
            preferredLanguage: null,
            explanationStyle: "balanced",
            inputStyle: "mixed",
            responseTraits: [],
            commonTopics: [],
            debuggingFrequency: "low"
          },
          longTermSummary: "Not enough general memory yet to summarize."
        }
      }
    }
  }

  private extractTopicKeywords(text: string): string[] {
    const normalized = text.toLowerCase()
    const keywordMap: Array<{ topic: string; patterns: RegExp[] }> = [
      { topic: "arrays", patterns: [/\barray\b/, /\bsubarray\b/, /\btwo sum\b/, /\bprefix\b/] },
      { topic: "strings", patterns: [/\bstring\b/, /\bsubstring\b/, /\bpalindrome\b/] },
      { topic: "hash maps", patterns: [/\bhash ?map\b/, /\bdictionary\b/, /\bmap\b/, /\bfrequency\b/] },
      { topic: "trees", patterns: [/\btree\b/, /\bbinary tree\b/, /\bbst\b/, /\btraversal\b/] },
      { topic: "graphs", patterns: [/\bgraph\b/, /\bbfs\b/, /\bdfs\b/, /\btopological\b/] },
      { topic: "dynamic programming", patterns: [/\bdp\b/, /\bdynamic programming\b/, /\bmemoization\b/] },
      { topic: "greedy", patterns: [/\bgreedy\b/] },
      { topic: "sorting", patterns: [/\bsort\b/, /\bsorted\b/, /\bmerge sort\b/, /\bquick sort\b/] },
      { topic: "linked lists", patterns: [/\blinked list\b/, /\blist node\b/] },
      { topic: "stacks", patterns: [/\bstack\b/, /\bmonotonic\b/] },
      { topic: "queues", patterns: [/\bqueue\b/, /\bdeque\b/, /\bpriority queue\b/, /\bheap\b/] },
      { topic: "binary search", patterns: [/\bbinary search\b/] },
      { topic: "sliding window", patterns: [/\bsliding window\b/] },
      { topic: "backtracking", patterns: [/\bbacktracking\b/, /\bpermutation\b/, /\bcombination\b/] },
      { topic: "sql", patterns: [/\bsql\b/, /\bquery\b/, /\bjoin\b/, /\bdatabase\b/] }
    ]

    return keywordMap
      .filter(({ patterns }) => patterns.some((pattern) => pattern.test(normalized)))
      .map(({ topic }) => topic)
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  }

  private extractUserName(text: string): string | null {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (!normalized) return null

    const patterns = [
      /\b(?:nama saya|namaku|my name is|i am|i'm|aku|saya)\s+([A-Za-z][A-Za-z' -]{1,40})/i,
      /\b(?:panggil saya|call me)\s+([A-Za-z][A-Za-z' -]{1,40})/i
    ]

    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      const candidate = match?.[1]?.trim()
      if (!candidate) continue

      const cleaned = candidate
        .replace(/\b(ya|yah|dong|please|pls|bro|bang|kak)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()

      if (cleaned.length >= 2 && cleaned.length <= 32) {
        return cleaned
      }
    }

    return null
  }

  private derivePersonalFacts(history: MemoryHistoryEntry[]): MemoryPersonalFacts {
    const defaults = this.getDefaultState()
    let bestName: string | null = null
    let bestScore = 0

    for (const entry of history) {
      const candidate = this.extractUserName(
        [entry.userInput, entry.problemInfo?.problem_statement || ""].filter(Boolean).join(" ")
      )

      if (!candidate) continue

      const score = this.getRecencyWeight(entry.createdAt)
      if (score > bestScore) {
        bestName = candidate
        bestScore = score
      }
    }

    return {
      userName: bestName || defaults.personalFacts?.userName || null
    }
  }

  private buildEntrySearchText(entry: MemoryHistoryEntry): string {
    return [
      entry.userInput,
      entry.language || "",
      entry.problemInfo?.problem_statement || "",
      entry.problemInfo?.constraints || "",
      entry.problemInfo?.example_input || "",
      entry.problemInfo?.example_output || "",
      entry.solution?.thoughts?.join(" ") || "",
      entry.debug?.thoughts?.join(" ") || "",
      entry.debug?.debug_analysis || ""
    ]
      .filter(Boolean)
      .join(" ")
  }

  private getRecencyWeight(createdAt: string): number {
    const createdTime = new Date(createdAt).getTime()
    if (Number.isNaN(createdTime)) {
      return 0.35
    }

    const ageInDays = Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60 * 24))
    return Math.max(0.35, 1.15 - ageInDays * 0.04)
  }

  private scoreHistoryEntry(entry: MemoryHistoryEntry, query: RetrievalQuery): number {
    let score = 0
    const queryText = [query.userText || "", query.currentProblemStatement || "", query.language || ""]
      .filter(Boolean)
      .join(" ")
    const entryText = this.buildEntrySearchText(entry)
    const queryTokens = this.tokenize(queryText)
    const entryTokens = new Set(this.tokenize(entryText))
    const queryTopics = new Set(this.extractTopicKeywords(queryText))
    const entryTopics = new Set(this.extractTopicKeywords(entryText))

    if (query.mode === "debug") {
      score += entry.type === "debug" ? 8 : 3
    } else if (entry.type === "solve") {
      score += 3
    }

    const entryMode = entry.mode || "coding"
    if (query.memoryMode) {
      score += entryMode === query.memoryMode ? 7 : -3
    }

    if (query.language && entry.language && query.language === entry.language) {
      score += 5
    }

    for (const topic of queryTopics) {
      if (entryTopics.has(topic)) {
        score += 6
      }
    }

    for (const token of queryTokens) {
      if (entryTokens.has(token)) {
        score += token.length >= 7 ? 2 : 1
      }
    }

    const problemPreview = (query.currentProblemStatement || "").toLowerCase()
    const entryProblem = (entry.problemInfo?.problem_statement || "").toLowerCase()

    if (problemPreview && entryProblem) {
      const shortNeedles = this.tokenize(problemPreview).slice(0, 8)
      if (shortNeedles.some((needle) => needle && entryProblem.includes(needle))) {
        score += 4
      }
    }

    score += Math.round(this.getRecencyWeight(entry.createdAt) * 6)

    return score
  }

  private buildDerivedInsights(history: MemoryHistoryEntry[]): MemoryModeInsight {
    if (history.length === 0) {
      const defaults = this.getDefaultState()
      return {
        preferences: defaults.preferences,
        longTermSummary: defaults.longTermSummary
      }
    }

    const languageCounts = new Map<string, number>()
    const topicCounts = new Map<string, number>()
    const responseTraitCounts = new Map<string, number>()
    const modeCounts = new Map<MemoryInteractionMode, number>()
    let detailedHints = 0
    let conciseHints = 0
    let textHeavyEntries = 0
    let screenshotHeavyEntries = 0
    let debugCount = 0
    let weightedHistoryTotal = 0

    const detailRegex = /\b(detail|detailed|thorough|step[- ]by[- ]step|jelas|jelaskan|rinci|lengkap|explain)\b/i
    const conciseRegex = /\b(concise|brief|short|singkat|ringkas)\b/i
    const optimizedRegex = /\b(optimal|optimize|efficient|performance|fast|best)\b/i
    const edgeCaseRegex = /\b(edge case|corner case|constraint|robust)\b/i
    const explanationRegex = /\b(reasoning|thoughts|intuition|approach|why)\b/i

    for (const entry of history) {
      const weight = this.getRecencyWeight(entry.createdAt)
      const entryMode = entry.mode || "coding"
      weightedHistoryTotal += weight
      modeCounts.set(entryMode, (modeCounts.get(entryMode) || 0) + weight)

      if (entry.language) {
        languageCounts.set(entry.language, (languageCounts.get(entry.language) || 0) + weight)
      }

      const combinedText = [
        entry.userInput,
        entry.problemInfo?.problem_statement || "",
        entry.problemInfo?.constraints || "",
        entry.debug?.debug_analysis || ""
      ]
        .filter(Boolean)
        .join(" ")

      for (const topic of this.extractTopicKeywords(combinedText)) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + weight)
      }

      if (detailRegex.test(combinedText)) detailedHints += weight
      if (conciseRegex.test(combinedText)) conciseHints += weight
      if (optimizedRegex.test(combinedText)) {
        responseTraitCounts.set(
          "optimized solutions",
          (responseTraitCounts.get("optimized solutions") || 0) + weight
        )
      }
      if (edgeCaseRegex.test(combinedText)) {
        responseTraitCounts.set(
          "edge-case awareness",
          (responseTraitCounts.get("edge-case awareness") || 0) + weight
        )
      }
      if (explanationRegex.test(combinedText) || entry.type === "debug") {
        responseTraitCounts.set(
          "clear reasoning",
          (responseTraitCounts.get("clear reasoning") || 0) + weight
        )
      }

      if ((entry.userInput || "").trim().length >= 140) {
        textHeavyEntries += weight
      } else if (!(entry.userInput || "").trim()) {
        screenshotHeavyEntries += weight
      }

      if (entry.type === "debug") {
        debugCount += weight
      }
    }

    const preferredLanguage =
      [...languageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

    let explanationStyle: MemoryPreferences["explanationStyle"] = "balanced"
    if (detailedHints > conciseHints) {
      explanationStyle = "detailed"
    } else if (conciseHints > detailedHints) {
      explanationStyle = "concise"
    }

    let inputStyle: MemoryPreferences["inputStyle"] = "mixed"
    if (textHeavyEntries > screenshotHeavyEntries * 1.5) {
      inputStyle = "text-heavy"
    } else if (screenshotHeavyEntries > textHeavyEntries * 1.5) {
      inputStyle = "screenshot-heavy"
    }

    let debuggingFrequency: MemoryPreferences["debuggingFrequency"] = "low"
    const debugRatio = debugCount / Math.max(weightedHistoryTotal, 1)
    if (debugRatio >= 0.5) {
      debuggingFrequency = "high"
    } else if (debugRatio >= 0.2) {
      debuggingFrequency = "medium"
    }

    const commonTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic)

    const responseTraits = [...responseTraitCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([trait]) => trait)

    const preferences: MemoryPreferences = {
      preferredLanguage,
      explanationStyle,
      inputStyle,
      responseTraits,
      commonTopics,
      debuggingFrequency
    }

    const summaryParts = [
      preferredLanguage ? `Most frequently used language: ${preferredLanguage}.` : null,
      `Current preferred explanation style: ${explanationStyle}.`,
      `User input pattern leans towards ${inputStyle}.`,
      modeCounts.get("general") && modeCounts.get("coding")
        ? `Recent interactions lean more towards ${
            (modeCounts.get("general") || 0) > (modeCounts.get("coding") || 0)
              ? "general"
              : "coding"
          } mode.`
        : null,
      responseTraits.length > 0 ? `Helpful response traits: ${responseTraits.join(", ")}.` : null,
      commonTopics.length > 0 ? `Frequently recurring topics: ${commonTopics.join(", ")}.` : null,
      debugCount > 0 ? `Debugging history: ${debugCount} times across the last ${history.length} interactions.` : null
    ]
      .filter(Boolean)
      .join(" ")

    return {
      preferences,
      longTermSummary: summaryParts || "User memory is available, but not yet detailed enough to summarize further."
    }
  }

  private ensureInitialized(): void {
    if (this.memoryPath && this.memoryDir) {
      return
    }

    this.memoryDir = path.join(app.getPath("userData"), "memory")
    this.memoryPath = path.join(app.getPath("userData"), "memory.json")
    this.profilePath = path.join(this.memoryDir, "profile.json")
    this.activeSessionPath = path.join(this.memoryDir, "active-session.json")
    this.historyPath = path.join(this.memoryDir, "history.json")
    this.summaryPath = path.join(this.memoryDir, "summary.json")

    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true })
    }

    const splitFilesExist = [
      this.profilePath,
      this.activeSessionPath,
      this.historyPath,
      this.summaryPath
    ].every((filePath) => filePath && fs.existsSync(filePath))

    if (!splitFilesExist) {
      if (fs.existsSync(this.memoryPath)) {
        try {
          const raw = fs.readFileSync(this.memoryPath, "utf8")
          const parsed = JSON.parse(raw) as Partial<MemoryState>
          const migratedState = this.sanitizeState(parsed)
          this.writeState(migratedState)
          return
        } catch (error) {
          console.error("Failed to migrate legacy memory.json:", error)
        }
      }

      this.writeState(this.getDefaultState())
    }
  }

  private sanitizeState(state: Partial<MemoryState> | null | undefined): MemoryState {
    const defaults = this.getDefaultState()
    const now = new Date().toISOString()
    const profile = state?.profile || defaults.profile
    const activeSession = state?.activeSession || defaults.activeSession
    const history = Array.isArray(state?.history) ? state!.history : defaults.history
    const normalizedHistory: MemoryHistoryEntry[] = history
      .filter(Boolean)
      .slice(0, MAX_HISTORY_ITEMS)
      .map((entry): MemoryHistoryEntry => ({
        id: entry.id || randomUUID(),
        type: entry.type === "debug" ? "debug" : "solve",
        mode: entry.mode === "general" ? "general" : "coding",
        createdAt: entry.createdAt || now,
        userInput: typeof entry.userInput === "string" ? entry.userInput : "",
        language: typeof entry.language === "string" ? entry.language : null,
        problemInfo: entry.problemInfo || null,
        solution: entry.solution || null,
        debug: entry.debug || null
      }))
    const derivedInsights = this.buildDerivedInsights(normalizedHistory)
    const codingInsights = this.buildDerivedInsights(
      normalizedHistory.filter((entry) => (entry.mode || "coding") === "coding")
    )
    const generalInsights = this.buildDerivedInsights(
      normalizedHistory.filter((entry) => (entry.mode || "coding") === "general")
    )
    const personalFacts = this.derivePersonalFacts(normalizedHistory)

    return {
      version: 1,
      profile: {
        id: profile.id || defaults.profile.id,
        createdAt: profile.createdAt || defaults.profile.createdAt,
        lastSeenAt: profile.lastSeenAt || now
      },
      activeSession: {
        promptDraft: typeof activeSession.promptDraft === "string" ? activeSession.promptDraft : "",
        problemInfo: activeSession.problemInfo || null,
        solution: activeSession.solution || null,
        debug: activeSession.debug || null,
        updatedAt: activeSession.updatedAt || null
      },
      preferences: derivedInsights.preferences,
      longTermSummary: derivedInsights.longTermSummary,
      personalFacts,
      history: normalizedHistory,
      modeInsights: {
        coding: codingInsights,
        general: generalInsights
      }
    }
  }

  private readState(): MemoryState {
    this.ensureInitialized()

    try {
      const profile = JSON.parse(fs.readFileSync(this.profilePath!, "utf8")) as Partial<MemoryState["profile"]>
      const activeSession = JSON.parse(
        fs.readFileSync(this.activeSessionPath!, "utf8")
      ) as Partial<MemoryState["activeSession"]>
      const history = JSON.parse(fs.readFileSync(this.historyPath!, "utf8")) as unknown
      const summary = JSON.parse(fs.readFileSync(this.summaryPath!, "utf8")) as Partial<
        Pick<MemoryState, "preferences" | "longTermSummary" | "modeInsights" | "personalFacts">
      >

      return this.sanitizeState({
        version: 1,
        profile: profile as MemoryProfile,
        activeSession: activeSession as ActiveSession,
        history: (Array.isArray(history) ? history : []) as unknown as MemoryHistoryEntry[],
        preferences: summary.preferences,
        longTermSummary: summary.longTermSummary,
        personalFacts: summary.personalFacts,
        modeInsights: summary.modeInsights
      })
    } catch (error) {
      console.error("Failed to read memory state:", error)
      const fallbackState = this.getDefaultState()
      this.writeState(fallbackState)
      return fallbackState
    }
  }

  private writeState(state: MemoryState): void {
    this.ensureInitialized()
    fs.writeFileSync(this.profilePath!, JSON.stringify(state.profile, null, 2), "utf8")
    fs.writeFileSync(
      this.activeSessionPath!,
      JSON.stringify(state.activeSession, null, 2),
      "utf8"
    )
    fs.writeFileSync(this.historyPath!, JSON.stringify(state.history, null, 2), "utf8")
    fs.writeFileSync(
      this.summaryPath!,
      JSON.stringify(
        {
          preferences: state.preferences,
          longTermSummary: state.longTermSummary,
          personalFacts: state.personalFacts,
          modeInsights: state.modeInsights
        },
        null,
        2
      ),
      "utf8"
    )
    fs.writeFileSync(this.memoryPath!, JSON.stringify(state, null, 2), "utf8")
  }

  private updateState(updater: (state: MemoryState) => MemoryState): MemoryState {
    const current = this.readState()
    const nextState = this.sanitizeState(updater(current))
    this.writeState(nextState)
    return nextState
  }

  public getMemoryState(): MemoryState {
    return this.updateState((state) => ({
      ...state,
      profile: {
        ...state.profile,
        lastSeenAt: new Date().toISOString()
      }
    }))
  }

  public getMemoryPath(): string {
    this.ensureInitialized()
    return this.memoryPath!
  }

  public savePromptDraft(promptDraft: string): MemoryState {
    return this.updateState((state) => ({
      ...state,
      activeSession: {
        ...state.activeSession,
        promptDraft,
        updatedAt: new Date().toISOString()
      }
    }))
  }

  public saveProblemInfo(problemInfo: MemoryProblemInfo): MemoryState {
    return this.updateState((state) => ({
      ...state,
      activeSession: {
        ...state.activeSession,
        problemInfo,
        solution: null,
        debug: null,
        updatedAt: new Date().toISOString()
      }
    }))
  }

  public saveSolution(solution: MemorySolution): MemoryState {
    return this.updateState((state) => ({
      ...state,
      activeSession: {
        ...state.activeSession,
        solution,
        debug: null,
        updatedAt: new Date().toISOString()
      }
    }))
  }

  public saveDebug(debug: MemoryDebugSession): MemoryState {
    return this.updateState((state) => ({
      ...state,
      activeSession: {
        ...state.activeSession,
        debug,
        updatedAt: new Date().toISOString()
      }
    }))
  }

  public appendHistoryEntry(entry: Omit<MemoryHistoryEntry, "id" | "createdAt">): MemoryState {
    return this.updateState((state) => ({
      ...state,
      history: [
        {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          ...entry
        },
        ...state.history
      ].slice(0, MAX_HISTORY_ITEMS)
    }))
  }

  public clearActiveSession(): MemoryState {
    return this.updateState((state) => ({
      ...state,
      activeSession: {
        promptDraft: "",
        problemInfo: null,
        solution: null,
        debug: null,
        updatedAt: new Date().toISOString()
      }
    }))
  }

  public getRelevantHistory(query: RetrievalQuery): MemoryHistoryEntry[] {
    const state = this.getMemoryState()
    const limit = Math.max(1, Math.min(query.limit || 3, 10))

    return state.history
      .map((entry) => ({
        entry,
        score: this.scoreHistoryEntry(entry, query)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }

        return new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime()
      })
      .slice(0, limit)
      .map(({ entry }) => entry)
  }
}

export const memoryHelper = new MemoryHelper()
