// ProcessingHelper.ts
import fs from "node:fs"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import * as axios from "axios"
import { app, BrowserWindow, dialog } from "electron"
import { OpenAI } from "openai"
import { configHelper } from "./ConfigHelper"
import Anthropic from '@anthropic-ai/sdk';
import { memoryHelper } from "./MemoryHelper"

// Interface for Gemini API requests
interface GeminiMessage {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    }
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
  done?: boolean;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

type ProblemInfoPayload = {
  problem_statement?: string
  constraints?: string
  example_input?: string
  example_output?: string
}

type SolutionPayload = {
  code: string
  thoughts: string[]
  time_complexity: string
  space_complexity: string
  response_mode: string
}

type FollowUpResult =
  | { success: true; data: SolutionPayload; problemInfo?: ProblemInfoPayload | null }
  | { success: false; error: string }

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private openaiClient: OpenAI | null = null
  private geminiApiKey: string | null = null
  private anthropicClient: Anthropic | null = null
  private ollamaHost: string | null = null

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    
    // Initialize AI client based on config
    this.initializeAIClient();
    
    // Listen for config changes to re-initialize the AI client
    configHelper.on('config-updated', () => {
      this.initializeAIClient();
    });
  }
  
  /**
   * Initialize or reinitialize the AI client with current config
   */
  private initializeAIClient(): void {
    try {
      const config = configHelper.loadConfig();
      
      if (config.apiProvider === "openai") {
        if (config.apiKey) {
          this.openaiClient = new OpenAI({ 
            apiKey: config.apiKey,
            timeout: 60000, // 60 second timeout
            maxRetries: 2   // Retry up to 2 times
          });
          this.geminiApiKey = null;
          this.anthropicClient = null;
          this.ollamaHost = null;
          console.log("OpenAI client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          this.ollamaHost = null;
          console.warn("No API key available, OpenAI client not initialized");
        }
      } else if (config.apiProvider === "gemini"){
        // Gemini client initialization
        this.openaiClient = null;
        this.anthropicClient = null;
        this.ollamaHost = null;
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey;
          console.log("Gemini API key set successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          this.ollamaHost = null;
          console.warn("No API key available, Gemini client not initialized");
        }
      } else if (config.apiProvider === "anthropic") {
        // Reset other clients
        this.openaiClient = null;
        this.geminiApiKey = null;
        this.ollamaHost = null;
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          });
          console.log("Anthropic client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          this.ollamaHost = null;
          console.warn("No API key available, Anthropic client not initialized");
        }
      } else if (config.apiProvider === "ollama") {
        this.openaiClient = null;
        this.geminiApiKey = null;
        this.anthropicClient = null;
        this.ollamaHost = config.ollamaHost || "http://localhost:11434";
        console.log(`Ollama host configured: ${this.ollamaHost}`);
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error);
      this.openaiClient = null;
      this.geminiApiKey = null;
      this.anthropicClient = null;
      this.ollamaHost = null;
    }
  }

  private getOllamaApiBase(config = configHelper.loadConfig()): string {
    return (config.ollamaHost || "http://localhost:11434").replace(/\/+$/, "");
  }

  private async callOllamaChat(
    config: ReturnType<typeof configHelper.loadConfig>,
    model: string,
    messages: OllamaMessage[],
    signal: AbortSignal,
    format?: "json"
  ): Promise<string> {
    const response = await axios.default.post(
      `${this.getOllamaApiBase(config)}/api/chat`,
      {
        model,
        messages,
        stream: false,
        format
      },
      {
        signal,
        timeout: 120000
      }
    );

    const responseData = response.data as OllamaChatResponse;
    if (responseData.error) {
      throw new Error(responseData.error);
    }

    const content = responseData.message?.content?.trim();
    if (!content) {
      throw new Error("Empty response from Ollama");
    }

    return content;
  }

  private async callOllamaChatStream(
    config: ReturnType<typeof configHelper.loadConfig>,
    model: string,
    messages: OllamaMessage[],
    signal: AbortSignal,
    onChunk?: (payload: { chunk: string; accumulated: string }) => void,
    format?: "json"
  ): Promise<string> {
    const response = await fetch(`${this.getOllamaApiBase(config)}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        format
      }),
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama streaming request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const payload = JSON.parse(trimmed) as OllamaChatResponse;
        if (payload.error) {
          throw new Error(payload.error);
        }

        const chunk = payload.message?.content || "";
        if (chunk) {
          accumulated += chunk;
          onChunk?.({ chunk, accumulated });
        }
      }
    }

    const finalChunk = buffer.trim();
    if (finalChunk) {
      const payload = JSON.parse(finalChunk) as OllamaChatResponse;
      if (payload.error) {
        throw new Error(payload.error);
      }

      const chunk = payload.message?.content || "";
      if (chunk) {
        accumulated += chunk;
        onChunk?.({ chunk, accumulated });
      }
    }

    const content = accumulated.trim();
    if (!content) {
      throw new Error("Empty streamed response from Ollama");
    }

    return content;
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 999 // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow)
      return 999 // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error)
      return 999 // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }
      
      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }
      
      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  private truncateText(text: string | undefined | null, maxLength = 220): string {
    if (!text) {
      return ""
    }

    const normalized = text.replace(/\s+/g, " ").trim()
    if (normalized.length <= maxLength) {
      return normalized
    }

    return `${normalized.slice(0, maxLength - 3)}...`
  }

  private buildMemoryContext(
    mode: "extract" | "solve" | "debug",
    language: string,
    options?: {
      userText?: string
      currentProblemStatement?: string
      memoryMode?: "coding" | "general"
    }
  ): string {
    const memoryState = memoryHelper.getMemoryState()
    const { preferences, longTermSummary, personalFacts } = memoryState
    const relevantHistory = memoryHelper
      .getRelevantHistory({
        mode,
        memoryMode: options?.memoryMode || "coding",
        language,
        userText: options?.userText,
        currentProblemStatement: options?.currentProblemStatement,
        limit: 3
      })
      .map((entry, index) => {
        const title =
          entry.problemInfo?.problem_statement ||
          entry.userInput ||
          (entry.type === "debug" ? "Debugging interaction" : "Solving interaction")

        const notes =
          entry.debug?.thoughts?.join("; ") ||
          entry.solution?.thoughts?.join("; ") ||
          ""

        return `${index + 1}. [${entry.type}] ${this.truncateText(title, 140)}${
          notes ? ` | Notes: ${this.truncateText(notes, 140)}` : ""
        }`
      })

    const preferenceLines = [
      `Preferred language trend: ${preferences.preferredLanguage || language}`,
      `Explanation style: ${preferences.explanationStyle}`,
      `Input style: ${preferences.inputStyle}`,
      `Debugging frequency: ${preferences.debuggingFrequency}`,
      personalFacts?.userName ? `Known user name: ${personalFacts.userName}` : "",
      preferences.responseTraits.length > 0
        ? `Helpful response traits: ${preferences.responseTraits.join(", ")}`
        : "",
      preferences.commonTopics.length > 0
        ? `Common recent topics: ${preferences.commonTopics.join(", ")}`
        : ""
    ].filter(Boolean)

    const contextualReminders = [
      mode === "extract"
        ? "Use this memory only to bias tone, language choice, and likely user expectations. Never let old memory override the current screenshots or typed input."
        : "Use this memory only as soft personalization. Never fabricate facts from memory or ignore the current problem.",
      options?.currentProblemStatement
        ? `Current problem preview: ${this.truncateText(options.currentProblemStatement, 180)}`
        : "",
      options?.userText ? `Current user text: ${this.truncateText(options.userText, 180)}` : ""
    ].filter(Boolean)

    return [
      "PERSONAL MEMORY CONTEXT:",
      ...preferenceLines,
      `Long-term summary: ${longTermSummary}`,
      relevantHistory.length > 0 ? `Recent relevant history:\n${relevantHistory.join("\n")}` : "",
      ...contextualReminders
    ]
      .filter(Boolean)
      .join("\n")
  }

  public async processScreenshots(
    userText?: string,
    mode: "solve" | "debug" = "solve"
  ): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig();
    
    // First verify we have a valid AI client
    if (config.apiProvider === "openai" && !this.openaiClient) {
      this.initializeAIClient();
      
      if (!this.openaiClient) {
        console.error("OpenAI client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
      this.initializeAIClient();
      
      if (!this.geminiApiKey) {
        console.error("Gemini API key not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "anthropic" && !this.anthropicClient) {
      // Add check for Anthropic client
      this.initializeAIClient();
      
      if (!this.anthropicClient) {
        console.error("Anthropic client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "ollama" && !this.ollamaHost) {
      this.initializeAIClient();

      if (!this.ollamaHost) {
        console.error("Ollama host not configured");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      
      const normalizedUserText = userText?.trim() || "";
      if ((!screenshotQueue || screenshotQueue.length === 0) && !normalizedUserText) {
        console.log("No screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingScreenshots = screenshotQueue.filter(path => fs.existsSync(path));
      if (existingScreenshots.length === 0 && !normalizedUserText) {
        console.log("Screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0 && !normalizedUserText) {
          throw new Error("Failed to load screenshot data");
        }

        const result =
          config.assistantMode === "general"
            ? await this.processGeneralScreenshotsHelper(
                validScreenshots,
                signal,
                normalizedUserText
              )
            : await this.processScreenshotsHelper(
                validScreenshots,
                signal,
                normalizedUserText
              )

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (
            result.error?.includes("API Key") ||
            result.error?.includes("OpenAI") ||
            result.error?.includes("Gemini") ||
            result.error?.includes("Anthropic") ||
            result.error?.includes("Ollama")
          ) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            )
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        if (config.assistantMode === "general") {
          memoryHelper.saveSolution(result.data)
          memoryHelper.appendHistoryEntry({
            type: "solve",
            mode: "general",
            userInput: normalizedUserText,
            language: config.language || null,
            problemInfo: this.deps.getProblemInfo(),
            solution: result.data,
            debug: null
          })
        }

        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else if (mode === "debug") {
      // view == 'solutions' and explicit debug
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      
      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        
        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter(path => fs.existsSync(path));
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ];
        
        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }
              
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )
        
        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }
        
        console.log(
          "Combined screenshots for processing:",
          validScreenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          memoryHelper.saveDebug(result.data)
          memoryHelper.appendHistoryEntry({
            type: "debug",
            mode: "coding",
            userInput: "",
            language: config.language || null,
            problemInfo: this.deps.getProblemInfo(),
            solution: null,
            debug: result.data
          })
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    } else {
      const normalizedUserText = userText?.trim() || ""
      const allPaths = [
        ...this.screenshotHelper.getScreenshotQueue(),
        ...this.screenshotHelper.getExtraScreenshotQueue()
      ]
      const existingScreenshots = allPaths.filter((path) => fs.existsSync(path))

      if (existingScreenshots.length === 0 && !normalizedUserText) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      this.currentProcessingAbortController = new AbortController()
      const { signal } = this.currentProcessingAbortController

      try {
        if (config.assistantMode === "general" && normalizedUserText) {
          const immediateProblemInfo = {
            problem_statement: normalizedUserText,
            constraints: "",
            example_input: "",
            example_output: ""
          }

          this.deps.setProblemInfo(immediateProblemInfo)
          memoryHelper.saveProblemInfo(immediateProblemInfo)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            immediateProblemInfo
          )
        }

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString("base64")
              }
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err)
              return null
            }
          })
        )

        const validScreenshots = screenshots.filter(Boolean)
        const result = await this.generateFollowUpResponseHelper(
          validScreenshots,
          signal,
          normalizedUserText
        )

        if (!result.success) {
          const errorMessage =
            "error" in result ? result.error : "Failed to process follow-up"
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            errorMessage
          )
          return
        }

        const nextProblemInfo = result.problemInfo || this.deps.getProblemInfo()
        if (nextProblemInfo) {
          this.deps.setProblemInfo(nextProblemInfo)
          memoryHelper.saveProblemInfo(nextProblemInfo)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            nextProblemInfo
          )
        }

        memoryHelper.saveSolution(result.data)
        memoryHelper.appendHistoryEntry({
          type: "solve",
          mode: config.assistantMode === "general" ? "general" : "coding",
          userInput: normalizedUserText,
          language: config.language || null,
          problemInfo: nextProblemInfo,
          solution: result.data,
          debug: null
        })
        this.screenshotHelper.clearExtraScreenshotQueue()
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          axios.isCancel(error)
            ? "Processing was canceled by the user."
            : error.message || "Failed to process follow-up"
        )
      } finally {
        this.currentProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    userText?: string
  ) {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();
      
      // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      const normalizedUserText = userText?.trim() || "";
      const memoryContext = this.buildMemoryContext("extract", language, {
        userText: normalizedUserText,
        memoryMode: config.assistantMode === "general" ? "general" : "coding"
      });
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20
        });
      }

      let problemInfo;
      
      if (imageDataList.length === 0 && normalizedUserText) {
        problemInfo = {
          problem_statement: normalizedUserText,
          constraints: "",
          example_input: "",
          example_output: ""
        };
      } else if (config.apiProvider === "openai") {
        // Verify OpenAI client
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize
          
          if (!this.openaiClient) {
            return {
              success: false,
              error: "OpenAI API key not configured or invalid. Please check your settings."
            };
          }
        }

        // Use OpenAI for processing
        const messages = [
          {
            role: "system" as const, 
            content: `You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text.\n\n${memoryContext}`
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `Extract the coding problem details from these screenshots. Return in JSON format. Preferred coding language we gonna use for this problem is ${language}.`
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        // Send to OpenAI Vision API
        const extractionResponse = await this.openaiClient.chat.completions.create({
          model: config.extractionModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });

        // Parse the response
        try {
          const responseText = extractionResponse.choices[0].message.content;
          // Handle when OpenAI might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error parsing OpenAI response:", error);
          return {
            success: false,
            error: "Failed to parse problem information. Please try again or use clearer screenshots."
          };
        }
      } else if (config.apiProvider === "gemini")  {
        // Use Gemini API
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }

        try {
          // Create Gemini message structure
          const geminiMessages: GeminiMessage[] = [
            {
              role: "user",
              parts: [
                {
                  text: `You are a coding challenge interpreter. Analyze the screenshots of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text. Preferred coding language we gonna use for this problem is ${language}.\n\n${memoryContext}`
                },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.extractionModel || "gemini-2.5-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          const responseText = responseData.candidates[0].content.parts[0].text;
          
          // Handle when Gemini might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error using Gemini API:", error);
          return {
            success: false,
            error: "Failed to process with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }

        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Extract the coding problem details from these screenshots. Return in JSON format with these fields: problem_statement, constraints, example_input, example_output. Preferred coding language is ${language}.\n\n${memoryContext}`
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data
                  }
                }))
              ]
            }
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.extractionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          const responseText = (response.content[0] as { type: 'text', text: string }).text;
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error: any) {
          console.error("Error using Anthropic API:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to process with Anthropic API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "ollama") {
        if (!this.ollamaHost) {
          return {
            success: false,
            error: "Ollama host is not configured. Please check your settings."
          };
        }

        try {
          const responseText = await this.callOllamaChat(
            config,
            config.extractionModel || "llama3.2-vision:11b",
            [
              {
                role: "system",
                content: `You are a coding challenge interpreter. Analyze the user's coding problem from screenshots and/or typed text. Return valid JSON only with these fields: problem_statement, constraints, example_input, example_output.\n\n${memoryContext}`
              },
              {
                role: "user",
                content: [
                  "Extract the coding problem details and return valid JSON only.",
                  `Preferred coding language is ${language}.`,
                  normalizedUserText
                    ? `User-provided text:\n${normalizedUserText}`
                    : "No additional typed text was provided.",
                  imageDataList.length > 0
                    ? "Use the attached screenshots as the primary source when available."
                    : "No screenshots were provided, so rely entirely on the typed text."
                ].join("\n\n"),
                ...(imageDataList.length > 0 ? { images: imageDataList } : {})
              }
            ],
            signal,
            "json"
          );

          problemInfo = JSON.parse(responseText.replace(/```json|```/g, "").trim());
        } catch (error: any) {
          console.error("Error using Ollama API for extraction:", error);
          return {
            success: false,
            error: error.message?.includes("connect")
              ? `Failed to reach Ollama at ${this.getOllamaApiBase(config)}. Make sure Ollama is running and the model is installed.`
              : "Failed to process screenshots with Ollama. Make sure the selected vision model is installed."
          };
        }
      }
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40
        });
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);
      memoryHelper.saveProblemInfo(problemInfo);

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );
        this.deps.setView("solutions");

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal);
        if (solutionsResult.success) {
          memoryHelper.saveSolution(solutionsResult.data);
          memoryHelper.appendHistoryEntry({
            type: "solve",
            mode: config.assistantMode === "general" ? "general" : "coding",
            userInput: normalizedUserText,
            language,
            problemInfo,
            solution: solutionsResult.data,
            debug: null
          });

          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();
          
          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          });
          
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      // Handle OpenAI API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "OpenAI server error. Please try again later."
        };
      }

      console.error("API Error Details:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process screenshots. Please try again." 
      };
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      const memoryContext = this.buildMemoryContext("solve", language, {
        currentProblemStatement: problemInfo.problem_statement,
        memoryMode: config.assistantMode === "general" ? "general" : "coding"
      })

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Creating optimal solution with detailed explanations...",
          progress: 60
        });
      }

      // Create prompt for solution generation
      const promptText = `
Generate a detailed solution for the following coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

I need the response in the following format:
1. Code: A clean, optimized implementation in ${language}
2. Your Thoughts: A list of key insights and reasoning behind your approach
3. Time complexity: O(X) with a detailed explanation (at least 2 sentences)
4. Space complexity: O(X) with a detailed explanation (at least 2 sentences)

For complexity explanations, please be thorough. For example: "Time complexity: O(n) because we iterate through the array only once. This is optimal as we need to examine each element at least once to find the solution." or "Space complexity: O(n) because in the worst case, we store all elements in the hashmap. The additional space scales linearly with the input size."

Your solution should be efficient, well-commented, and handle edge cases.

${memoryContext}
`;

      let responseContent;
      
      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        // Send to OpenAI API
        const solutionResponse = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: [
            { role: "system", content: `You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations.\n\n${memoryContext}` },
            { role: "user", content: promptText }
          ],
          max_tokens: 4000,
          temperature: 0.2
        });

        responseContent = solutionResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        // Gemini processing
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          // Create Gemini message structure
          const geminiMessages = [
            {
              role: "user",
              parts: [
                {
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${memoryContext}\n\n${promptText}`
                }
              ]
            }
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.5-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          responseContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for solution:", error);
          return {
            success: false,
            error: "Failed to generate solution with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${memoryContext}\n\n${promptText}`
                }
              ]
            }
          ];

          // Send to Anthropic API
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for solution:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to generate solution with Anthropic API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "ollama") {
        if (!this.ollamaHost) {
          return {
            success: false,
            error: "Ollama host is not configured. Please check your settings."
          };
        }

        try {
          responseContent = await this.callOllamaChatStream(
            config,
            config.solutionModel || "qwen2.5-coder:7b",
            [
              {
                role: "system",
                content: `You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations.\n\n${memoryContext}`
              },
              {
                role: "user",
                content: promptText
              }
            ],
            signal,
            ({ accumulated }) => {
              if (mainWindow) {
                mainWindow.webContents.send(
                  this.deps.PROCESSING_EVENTS.SOLUTION_STREAM,
                  { content: accumulated }
                );
              }
            }
          );
        } catch (error: any) {
          console.error("Error using Ollama API for solution:", error);
          return {
            success: false,
            error: error.message?.includes("connect")
              ? `Failed to reach Ollama at ${this.getOllamaApiBase(config)}. Make sure Ollama is running.`
              : "Failed to generate solution with Ollama. Make sure the selected model is installed."
          };
        }
      }
      
      // Extract parts from the response
      const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : responseContent;
      
      // Extract thoughts, looking for bullet points or numbered lists
      const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
      const thoughtsMatch = responseContent.match(thoughtsRegex);
      let thoughts: string[] = [];
      
      if (thoughtsMatch && thoughtsMatch[1]) {
        // Extract bullet points or numbered items
        const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
        if (bulletPoints) {
          thoughts = bulletPoints.map(point => 
            point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
          ).filter(Boolean);
        } else {
          // If no bullet points found, split by newlines and filter empty lines
          thoughts = thoughtsMatch[1].split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        }
      }
      
      // Extract complexity information
      const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;
      const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;
      
      let timeComplexity = "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
      let spaceComplexity = "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";
      
      const timeMatch = responseContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because')) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, '').trim();
            timeComplexity = `${notation} - ${rest}`;
          }
        }
      }
      
      const spaceMatch = responseContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(n) - ${spaceComplexity}`;
        } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because')) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, '').trim();
            spaceComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const formattedResponse = {
        code: code,
        thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity,
        response_mode: "coding"
      };

      return { success: true, data: formattedResponse };
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Solution generation error:", error);
      return { success: false, error: error.message || "Failed to generate solution" };
    }
  }

  private async processGeneralScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    userText?: string
  ) {
    const mainWindow = this.deps.getMainWindow()
    const normalizedUserText =
      userText?.trim() || "Please describe and answer based on the attached content."
    const problemInfo = {
      problem_statement: normalizedUserText,
      constraints: "",
      example_input: "",
      example_output: ""
    }

    this.deps.setProblemInfo(problemInfo)
    memoryHelper.saveProblemInfo(problemInfo)

    if (mainWindow) {
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        problemInfo
      )
      this.deps.setView("solutions")
    }

    return this.generateGeneralResponseHelper(screenshots, signal, normalizedUserText)
  }

  private async generateFollowUpResponseHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    userText?: string
  ): Promise<FollowUpResult> {
    const config = configHelper.loadConfig()
    const normalizedUserText =
      userText?.trim() || "Refine the current answer using the attached screenshots."

    if (config.assistantMode === "general") {
      const generalResult = await this.generateGeneralResponseHelper(
        screenshots,
        signal,
        normalizedUserText
      )

      if (!generalResult.success) {
        return {
          success: false,
          error: generalResult.error || "Failed to generate follow-up response."
        }
      }

      return {
        success: true,
        problemInfo: {
          problem_statement: normalizedUserText,
          constraints: "",
          example_input: "",
          example_output: ""
        },
        data: generalResult.data
      }
    }

    const problemInfo = this.deps.getProblemInfo()
    const savedSolution = memoryHelper.getMemoryState().activeSession.solution
    const language = await this.getLanguage()
    const mainWindow = this.deps.getMainWindow()
    const imageDataList = screenshots.map((screenshot) => screenshot.data)
    const memoryContext = this.buildMemoryContext("solve", language, {
      userText: normalizedUserText,
      currentProblemStatement: problemInfo?.problem_statement,
      memoryMode: "coding"
    })

    const promptText = `
You are continuing an existing coding-assistant conversation.

CURRENT PROBLEM:
${problemInfo?.problem_statement || "No stored problem statement."}

CURRENT SOLUTION:
${savedSolution?.code || "No previous solution stored."}

CURRENT THOUGHTS:
${savedSolution?.thoughts?.join("\n- ") || "No previous notes."}

USER FOLLOW-UP:
${normalizedUserText}

Return the response in this format:
1. Code: updated or confirmed code in ${language} if relevant
2. Your Thoughts: bullet points about the update or answer
3. Time complexity: include only if relevant to the follow-up
4. Space complexity: include only if relevant to the follow-up

If the follow-up is conceptual, answer clearly and keep the code section concise.

${memoryContext}
`

    if (mainWindow) {
      mainWindow.webContents.send("processing-status", {
        message: "Continuing the solution with your follow-up...",
        progress: 60
      })
    }

    const configProvider = config.apiProvider
    let responseContent = ""

    if (configProvider === "ollama") {
      responseContent = await this.callOllamaChatStream(
        config,
        config.solutionModel || "qwen2.5-coder:7b",
        [
          {
            role: "system",
            content: `You are an expert coding assistant continuing a previous conversation.\n\n${memoryContext}`
          },
          {
            role: "user",
            content: promptText,
            ...(imageDataList.length > 0 ? { images: imageDataList } : {})
          }
        ],
        signal,
        ({ accumulated }) => {
          if (mainWindow) {
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_STREAM, {
              content: accumulated
            })
          }
        }
      )
    } else {
      return { success: false, error: "Follow-up solve currently supports Ollama in this build." }
    }

    let updatedProblemInfo = problemInfo || {
      problem_statement: normalizedUserText,
      constraints: "",
      example_input: "",
      example_output: ""
    }

    if (configProvider === "ollama") {
      try {
        const updatedProblemInfoText = await this.callOllamaChat(
          config,
          config.extractionModel || "llama3.2-vision:11b",
          [
            {
              role: "system",
              content: [
                "You update the canonical problem description for an ongoing coding-assistant conversation.",
                "Return valid JSON only with: problem_statement, constraints, example_input, example_output.",
                "Combine the previous problem with the new follow-up text and screenshots.",
                "If the follow-up changes requirements, output the revised latest version.",
                "If the follow-up is only a clarification, keep the original problem but enrich it with the new details.",
                memoryContext
              ].join("\n\n")
            },
            {
              role: "user",
              content: [
                "Update the stored problem statement using the previous context plus this follow-up.",
                `Previous problem statement:\n${problemInfo?.problem_statement || "No stored problem statement."}`,
                `Previous constraints:\n${problemInfo?.constraints || "None"}`,
                `Previous example input:\n${problemInfo?.example_input || "None"}`,
                `Previous example output:\n${problemInfo?.example_output || "None"}`,
                `Follow-up text:\n${normalizedUserText}`,
                imageDataList.length > 0
                  ? "Use the attached screenshots as additional context for the updated problem."
                  : "No new screenshots were attached."
              ].join("\n\n"),
              ...(imageDataList.length > 0 ? { images: imageDataList } : {})
            }
          ],
          signal,
          "json"
        )

        const parsedProblemInfo = JSON.parse(
          updatedProblemInfoText.replace(/```json|```/g, "").trim()
        )

        updatedProblemInfo = {
          problem_statement:
            parsedProblemInfo?.problem_statement ||
            problemInfo?.problem_statement ||
            normalizedUserText,
          constraints:
            parsedProblemInfo?.constraints ??
            problemInfo?.constraints ??
            "",
          example_input:
            parsedProblemInfo?.example_input ??
            problemInfo?.example_input ??
            "",
          example_output:
            parsedProblemInfo?.example_output ??
            problemInfo?.example_output ??
            ""
        }
      } catch (error) {
        console.error("Failed to refresh problem info for follow-up:", error)
      }
    }

    const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/)
    const code = codeMatch ? codeMatch[1].trim() : responseContent
    const bulletPoints = responseContent.match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g)
    const thoughts = bulletPoints
      ? bulletPoints
          .map((point) => point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").trim())
          .filter(Boolean)
      : ["Follow-up response generated from the current conversation."]

    const timeMatch = responseContent.match(/Time complexity:?\s*([^\n]+)/i)
    const spaceMatch = responseContent.match(/Space complexity:?\s*([^\n]+)/i)

    return {
      success: true,
      problemInfo: updatedProblemInfo,
      data: {
        code,
        thoughts,
        time_complexity: timeMatch?.[1]?.trim() || "Not specifically discussed in this follow-up.",
        space_complexity: spaceMatch?.[1]?.trim() || "Not specifically discussed in this follow-up.",
        response_mode: "coding"
      }
    }
  }

  private async generateGeneralResponseHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    userText?: string
  ) {
    const config = configHelper.loadConfig()
    const mainWindow = this.deps.getMainWindow()
    const language = await this.getLanguage()
    const normalizedUserText = userText?.trim() || "Please answer based on the attached content."
    const imageDataList = screenshots.map((screenshot) => screenshot.data)
    const currentSolution = memoryHelper.getMemoryState().activeSession.solution
    const memoryContext = this.buildMemoryContext("solve", language, {
      userText: normalizedUserText,
      memoryMode: "general"
    })

    const promptText = [
      "Respond like a helpful general-purpose AI assistant.",
      "You may answer any topic including science, math, biology, civics, code, and general knowledge.",
      "If the question is about code, you may still provide code when useful.",
      currentSolution?.code ? `Previous assistant response:\n${currentSolution.code}` : "",
      `User request:\n${normalizedUserText}`,
      imageDataList.length > 0
        ? "Use attached screenshots as additional context when relevant."
        : "No screenshots were attached.",
      memoryContext
    ]
      .filter(Boolean)
      .join("\n\n")

    let responseContent = ""

    if (config.apiProvider === "ollama") {
      responseContent = await this.callOllamaChatStream(
        config,
        imageDataList.length > 0
          ? config.extractionModel || "llama3.2-vision:11b"
          : config.solutionModel || "qwen2.5-coder:7b",
        [
          {
            role: "system",
            content:
              "You are a helpful general assistant. Answer naturally, clearly, and directly. If code is requested, include it; otherwise, respond in normal prose."
          },
          {
            role: "user",
            content: promptText,
            ...(imageDataList.length > 0 ? { images: imageDataList } : {})
          }
        ],
        signal,
        ({ accumulated }) => {
          if (mainWindow) {
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_STREAM, {
              content: accumulated
            })
          }
        }
      )
    } else if (config.apiProvider === "gemini") {
      if (!this.geminiApiKey) {
        return { success: false, error: "Gemini API key not configured. Please check your settings." }
      }
      try {
        const parts: any[] = [{ text: promptText }]
        if (imageDataList.length > 0) {
          imageDataList.forEach((data) => {
            parts.push({
              inlineData: {
                mimeType: "image/png",
                data
              }
            })
          })
        }
        const modelName = config.solutionModel || config.extractionModel || "gemini-2.5-flash"
        const response = await axios.default.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.geminiApiKey}`,
          {
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4000
            }
          },
          { signal }
        )
        const responseData = response.data as GeminiResponse
        if (!responseData.candidates || responseData.candidates.length === 0) {
          throw new Error("Empty response from Gemini API")
        }
        responseContent = responseData.candidates[0].content.parts[0].text || ""
        if (mainWindow) {
          mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_STREAM, {
            content: responseContent
          })
        }
      } catch (err: any) {
        console.error("Gemini general mode error:", err)
        return {
          success: false,
          error: err?.response?.data?.error?.message || err?.message || "Failed to process request with Gemini API."
        }
      }
    } else if (config.apiProvider === "openai") {
      if (!this.openaiClient) {
        this.initializeAIClient()
        if (!this.openaiClient) {
          return { success: false, error: "OpenAI client not initialized. Please check your API key." }
        }
      }
      try {
        const userContent: any[] = [{ type: "text", text: promptText }]
        imageDataList.forEach((data) => {
          userContent.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${data}` }
          })
        })
        const modelName = config.solutionModel || "gpt-4o"
        const completion = await this.openaiClient.chat.completions.create(
          {
            model: modelName,
            messages: [
              {
                role: "system",
                content: "You are a helpful general-purpose AI assistant. Answer naturally, clearly, and directly."
              },
              { role: "user", content: userContent }
            ],
            temperature: 0.3,
            max_tokens: 4000
          },
          { signal }
        )
        responseContent = completion.choices[0]?.message?.content || ""
        if (mainWindow) {
          mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_STREAM, {
            content: responseContent
          })
        }
      } catch (err: any) {
        console.error("OpenAI general mode error:", err)
        return {
          success: false,
          error: err?.message || "Failed to process request with OpenAI API."
        }
      }
    } else if (config.apiProvider === "anthropic") {
      if (!this.anthropicClient) {
        this.initializeAIClient()
        if (!this.anthropicClient) {
          return { success: false, error: "Anthropic client not initialized. Please check your API key." }
        }
      }
      try {
        const userContent: any[] = [{ type: "text", text: promptText }]
        imageDataList.forEach((data) => {
          userContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data
            }
          })
        })
        const modelName = config.solutionModel || "claude-3-7-sonnet-20250219"
        const message = await this.anthropicClient.messages.create(
          {
            model: modelName,
            max_tokens: 4000,
            temperature: 0.3,
            system: "You are a helpful general-purpose AI assistant. Answer naturally, clearly, and directly.",
            messages: [{ role: "user", content: userContent }]
          },
          { signal }
        )
        const textBlock = message.content.find((block) => block.type === "text")
        responseContent = textBlock?.type === "text" ? textBlock.text : ""
        if (mainWindow) {
          mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_STREAM, {
            content: responseContent
          })
        }
      } catch (err: any) {
        console.error("Anthropic general mode error:", err)
        return {
          success: false,
          error: err?.message || "Failed to process request with Anthropic API."
        }
      }
    }

    const bulletPoints = responseContent.match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g)
    const thoughts = bulletPoints
      ? bulletPoints
          .map((point) => point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : []

    return {
      success: true,
      data: {
        code: responseContent.trim(),
        thoughts,
        time_complexity: "",
        space_complexity: "",
        response_mode: "general"
      }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      const memoryContext = this.buildMemoryContext("debug", language, {
        currentProblemStatement: problemInfo.problem_statement,
        memoryMode: "coding"
      })

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      let debugContent;
      
      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        const messages = [
          {
            role: "system" as const, 
            content: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).

${memoryContext}`
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed

${memoryContext}` 
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60
          });
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model: config.debuggingModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });
        
        debugContent = debugResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).

${memoryContext}
`;

          const geminiMessages = [
            {
              role: "user",
              parts: [
                { text: debugPrompt },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Gemini...",
              progress: 60
            });
          }

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.debuggingModel || "gemini-2.5-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          debugContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for debugging:", error);
          return {
            success: false,
            error: "Failed to process debug request with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.
`;

          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: debugPrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const, 
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Claude...",
              progress: 60
            });
          }

          const response = await this.anthropicClient.messages.create({
            model: config.debuggingModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });
          
          debugContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for debugging:", error);
          
          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }
          
          return {
            success: false,
            error: "Failed to process debug request with Anthropic API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "ollama") {
        if (!this.ollamaHost) {
          return {
            success: false,
            error: "Ollama host is not configured. Please check your settings."
          };
        }

        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.

${memoryContext}
`;

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Ollama...",
              progress: 60
            });
          }

          debugContent = await this.callOllamaChatStream(
            config,
            config.debuggingModel || "llama3.2-vision:11b",
            [
              {
                role: "user",
                content: debugPrompt,
                images: imageDataList
              }
            ],
            signal,
            ({ accumulated }) => {
              if (mainWindow) {
                mainWindow.webContents.send(
                  this.deps.PROCESSING_EVENTS.DEBUG_STREAM,
                  { content: accumulated }
                );
              }
            }
          );
        } catch (error: any) {
          console.error("Error using Ollama API for debugging:", error);
          return {
            success: false,
            error: error.message?.includes("connect")
              ? `Failed to reach Ollama at ${this.getOllamaApiBase(config)}. Make sure Ollama is running.`
              : "Failed to process debug request with Ollama. Make sure the selected vision model is installed."
          };
        }
      }
      
      
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        });
      }

      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      let formattedDebugContent = debugContent;
      
      if (!debugContent.includes('# ') && !debugContent.includes('## ')) {
        formattedDebugContent = debugContent
          .replace(/issues identified|problems found|bugs found/i, '## Issues Identified')
          .replace(/code improvements|improvements|suggested changes/i, '## Code Improvements')
          .replace(/optimizations|performance improvements/i, '## Optimizations')
          .replace(/explanation|detailed analysis/i, '## Explanation');
      }

      const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
      const thoughts = bulletPoints 
        ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"];
      
      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      };

      return { success: true, data: response };
    } catch (error: any) {
      console.error("Debug processing error:", error);
      return { success: false, error: error.message || "Failed to process debug request" };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    this.deps.setHasDebugged(false)

    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}
