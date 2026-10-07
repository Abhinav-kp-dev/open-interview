// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import axios from "axios"

type ApiProvider = "openai" | "gemini" | "anthropic" | "ollama";

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_OLLAMA_VISION_MODEL = "llama3.2-vision:11b";
const DEFAULT_OLLAMA_TEXT_MODEL = "qwen2.5-coder:7b";

interface Config {
  apiKey: string;
  apiProvider: ApiProvider;
  assistantMode: "coding" | "general";
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  debugMenuEnabled: boolean;
  ollamaHost: string;
  language: string;
  opacity: number;
  preferredWindowWidth: number;
  preferredWindowHeight: number;
  superadminMode: boolean;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    size?: number;
    modified_at?: string;
  }>;
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "ollama",
    assistantMode: "coding",
    extractionModel: DEFAULT_OLLAMA_VISION_MODEL,
    solutionModel: DEFAULT_OLLAMA_TEXT_MODEL,
    debuggingModel: DEFAULT_OLLAMA_VISION_MODEL,
    debugMenuEnabled: false,
    ollamaHost: DEFAULT_OLLAMA_HOST,
    language: "python",
    opacity: 1.0,
    preferredWindowWidth: 800,
    preferredWindowHeight: 600,
    superadminMode: false
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  public getDefaultModelsForProvider(provider: ApiProvider): Pick<Config, "extractionModel" | "solutionModel" | "debuggingModel"> {
    switch (provider) {
      case "gemini":
        return {
          extractionModel: "gemini-2.5-flash",
          solutionModel: "gemini-2.5-flash",
          debuggingModel: "gemini-2.5-flash"
        };
      case "openai":
        return {
          extractionModel: "gpt-4o",
          solutionModel: "gpt-4o",
          debuggingModel: "gpt-4o"
        };
      case "anthropic":
        return {
          extractionModel: "claude-3-7-sonnet-20250219",
          solutionModel: "claude-3-7-sonnet-20250219",
          debuggingModel: "claude-3-7-sonnet-20250219"
        };
      case "ollama":
      default:
        return {
          extractionModel: DEFAULT_OLLAMA_VISION_MODEL,
          solutionModel: DEFAULT_OLLAMA_TEXT_MODEL,
          debuggingModel: DEFAULT_OLLAMA_VISION_MODEL
        };
    }
  }

  private sanitizeModelSelection(model: string, provider: ApiProvider): string {
    const trimmed = model ? model.trim() : "";
    if (trimmed) return trimmed;
    const defaults = this.getDefaultModelsForProvider(provider);
    return defaults.solutionModel;
  }

  private normalizeOllamaHost(host?: string): string {
    const trimmedHost = host?.trim();
    if (!trimmedHost) {
      return DEFAULT_OLLAMA_HOST;
    }

    return trimmedHost.replace(/\/+$/, "");
  }

  private sanitizeWindowDimension(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.round(Math.max(550, Math.min(1600, value)));
  }

  private sanitizeOpacity(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(1, Math.max(0.1, Number(value.toFixed(2))));
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        const validProviders: ApiProvider[] = ["openai", "gemini", "anthropic", "ollama"];
        config.apiProvider = validProviders.includes(config.apiProvider) ? config.apiProvider : "gemini";
        config.apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
        config.assistantMode =
          config.assistantMode === "general" ? "general" : "coding";

        config.ollamaHost = this.normalizeOllamaHost(config.ollamaHost);
        config.preferredWindowWidth = this.sanitizeWindowDimension(
          config.preferredWindowWidth,
          this.defaultConfig.preferredWindowWidth
        );
        config.preferredWindowHeight = this.sanitizeWindowDimension(
          config.preferredWindowHeight,
          this.defaultConfig.preferredWindowHeight
        );
        config.opacity = this.sanitizeOpacity(
          config.opacity,
          this.defaultConfig.opacity
        );
        
        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
        }
        
        return {
          ...this.defaultConfig,
          ...config
        };
      }
      
      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      const validProviders: ApiProvider[] = ["openai", "gemini", "anthropic", "ollama"];
      const provider: ApiProvider = updates.apiProvider && validProviders.includes(updates.apiProvider)
        ? updates.apiProvider
        : currentConfig.apiProvider;

      updates.apiProvider = provider;
      if (updates.apiKey !== undefined) {
        updates.apiKey = updates.apiKey.trim();
      }
      if (updates.assistantMode !== undefined) {
        updates.assistantMode =
          updates.assistantMode === "general" ? "general" : "coding";
      }

      if (updates.ollamaHost !== undefined) {
        updates.ollamaHost = this.normalizeOllamaHost(updates.ollamaHost);
      }
      if (updates.preferredWindowWidth !== undefined) {
        updates.preferredWindowWidth = this.sanitizeWindowDimension(
          updates.preferredWindowWidth,
          currentConfig.preferredWindowWidth
        );
      }
      if (updates.preferredWindowHeight !== undefined) {
        updates.preferredWindowHeight = this.sanitizeWindowDimension(
          updates.preferredWindowHeight,
          currentConfig.preferredWindowHeight
        );
      }
      if (updates.debugMenuEnabled !== undefined) {
        updates.debugMenuEnabled = Boolean(updates.debugMenuEnabled);
      }
      if (updates.opacity !== undefined) {
        updates.opacity = this.sanitizeOpacity(
          updates.opacity,
          currentConfig.opacity
        );
      }
      
      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
      }
      
      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);
      
      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (updates.apiKey !== undefined || updates.apiProvider !== undefined || 
          updates.extractionModel !== undefined || updates.solutionModel !== undefined || 
          updates.debuggingModel !== undefined || updates.ollamaHost !== undefined ||
          updates.debugMenuEnabled !== undefined ||
          updates.language !== undefined ||
          updates.preferredWindowWidth !== undefined ||
          updates.preferredWindowHeight !== undefined) {
        this.emit('config-updated', newConfig);
      }
      
      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    if (config.apiProvider === "ollama") {
      return !!config.ollamaHost;
    }
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }
  
  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: ApiProvider): boolean {
    return true;
  }
  
  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return this.sanitizeOpacity(config.opacity, this.defaultConfig.opacity);
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    const validOpacity = this.sanitizeOpacity(opacity, this.defaultConfig.opacity);
    this.updateConfig({ opacity: validOpacity });
  }  
  
  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }
  
  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: ApiProvider, ollamaHost?: string): Promise<{valid: boolean, error?: string}> {
    const selectedProvider = provider || "ollama";
    if (selectedProvider === "ollama") {
      return this.testOllamaConnection(ollamaHost);
    }

    const trimmedKey = (apiKey || "").trim();
    if (!trimmedKey) {
      return { valid: false, error: "Please provide an API key." };
    }

    if (selectedProvider === "gemini") {
      try {
        await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`, { timeout: 8000 });
        return { valid: true };
      } catch (err: any) {
        return {
          valid: false,
          error: err?.response?.data?.error?.message || "Invalid Gemini API key or connection error."
        };
      }
    }

    if (selectedProvider === "openai") {
      try {
        await axios.get("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${trimmedKey}` },
          timeout: 8000
        });
        return { valid: true };
      } catch (err: any) {
        return {
          valid: false,
          error: err?.response?.data?.error?.message || "Invalid OpenAI API key or connection error."
        };
      }
    }

    if (selectedProvider === "anthropic") {
      if (!trimmedKey.startsWith("sk-ant-")) {
        return {
          valid: false,
          error: "Anthropic API keys typically start with 'sk-ant-'"
        };
      }
      return { valid: true };
    }

    return { valid: true };
  }

  private async testOllamaConnection(ollamaHost?: string): Promise<{valid: boolean, error?: string}> {
    const host = this.normalizeOllamaHost(ollamaHost);

    try {
      await axios.get(`${host}/api/tags`, { timeout: 5000 });
      return { valid: true };
    } catch (error: any) {
      console.error("Ollama connection test failed:", error);
      return {
        valid: false,
        error: `Could not reach Ollama at ${host}. Make sure Ollama is running and the host is correct.`
      };
    }
  }
  
  public async listOllamaModels(ollamaHost?: string): Promise<Array<{ name: string; size?: number; modifiedAt?: string }>> {
    const host = this.normalizeOllamaHost(ollamaHost);
    const response = await axios.get(`${host}/api/tags`, { timeout: 8000 });
    const data = response.data as OllamaTagsResponse;

    return (data.models || [])
      .map((model) => ({
        name: model.name?.trim() || "",
        size: model.size,
        modifiedAt: model.modified_at
      }))
      .filter((model) => model.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();
