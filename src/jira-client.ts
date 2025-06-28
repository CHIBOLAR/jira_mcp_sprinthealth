import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { JiraConfig, JiraProject, JiraBoard, JiraSprint, JiraIssue, JiraApiError } from '../types/index.js';
import { ErrorHandler, JiraError, PerformanceMonitor } from './error-handler.js';
import { ConfigurationManager } from './config-manager.js';

/**
 * Enhanced Jira API Client - Week 3 Implementation
 * Features: Performance optimization, caching, advanced error handling, concurrent processing
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class JiraApiClient {
  private client: AxiosInstance;
  private config: JiraConfig;
  private cache = new Map<string, CacheEntry<any>>();
  private requestQueue = new Map<string, Promise<any>>();
  private configManager: ConfigurationManager;

  constructor(config: JiraConfig) {
    this.config = config;
    this.configManager = ConfigurationManager.getInstance();
    
    // Validate configuration
    if (!config.baseUrl || !config.email || !config.apiToken) {
      throw ErrorHandler.handleConfigError(['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
    }

    // Create axios instance with authentication
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: config.timeout || 30000,
    });

    // Enhanced response interceptor with categorized error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const categorizedError = ErrorHandler.categorizeAndHandle(error);
        throw categorizedError;
      }
    );

    // Auto-cleanup cache every 5 minutes
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
  }

  /**
   * Generic cached request method
   */
  private async cachedRequest<T>(
    cacheKey: string,
    requestFn: () => Promise<T>,
    ttl: number = 300000, // 5 minutes default
    bypassCache: boolean = false
  ): Promise<T> {
    // Check cache first (unless bypassing)
    if (!bypassCache && this.isCacheValid(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return cached.data;
    }

    // Check if request is already in progress (prevent duplicate requests)
    if (this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey)!;
    }

    // Execute request
    const requestPromise = requestFn();
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl
      });

      return result;
    } finally {
      // Remove from request queue
      this.requestQueue.delete(cacheKey);
    }
  }

  /**
   * Check if cache entry is valid
   */
  private isCacheValid(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    return !isExpired;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Test connection with enhanced error reporting
   */
  async testConnection(): Promise<boolean> {
    PerformanceMonitor.startTimer('test_connection');
    
    try {
      await this.client.get('/rest/api/3/myself');
      const duration = PerformanceMonitor.endTimer('test_connection');
      
      console.log(`✅ Jira connection successful (${PerformanceMonitor.formatDuration(duration)})`);
      return true;
    } catch (error) {
      PerformanceMonitor.endTimer('test_connection');
      
      if (error instanceof JiraError) {
        throw error;
      }
      throw ErrorHandler.categorizeAndHandle(error, { operation: 'test_connection' });
    }
  }

  /**
   * Get all accessible projects with caching
   */
  async getProjects(): Promise<JiraProject[]> {
    PerformanceMonitor.startTimer('get_projects');
    
    try {
      const result = await this.cachedRequest(
        'projects',
        async () => {
          const response: AxiosResponse<{ values: JiraProject[] }> = await this.client.get('/rest/api/3/project/search?maxResults=1000');
          return response.data.values;
        },
        600000 // 10 minutes cache for projects
      );
      
      PerformanceMonitor.endTimer('get_projects');
      return result;
    } catch (error) {
      PerformanceMonitor.endTimer('get_projects');
      throw ErrorHandler.categorizeAndHandle(error, { operation: 'get_projects' });
    }
  }

  /**
   * Get boards for a specific project with enhanced error handling
   */
  async getBoards(projectKey: string): Promise<{ values: JiraBoard[] }> {
    PerformanceMonitor.startTimer(`get_boards_${projectKey}`);
    
    try {
      const result = await this.cachedRequest(
        `boards_${projectKey}`,
        async () => {
          const response: AxiosResponse<{ values: JiraBoard[] }> = await this.client.get(
            `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`
          );
          return response.data;
        },
        300000 // 5 minutes cache for boards
      );
      
      if (result.values.length === 0) {
        throw new JiraError(
          `No Scrum boards found for project '${projectKey}'`,
          'NO_SCRUM_BOARDS',
          [
            '1. Create a Scrum board for your project',
            '2. Ensure the board is associated with your project',
            '3. Check if using Kanban boards (not supported for sprint analytics)',
            '4. Verify board permissions and configuration'
          ]
        );
      }
      
      PerformanceMonitor.endTimer(`get_boards_${projectKey}`);
      return result;
    } catch (error) {
      PerformanceMonitor.endTimer(`get_boards_${projectKey}`);
      throw ErrorHandler.categorizeAndHandle(error, { operation: 'get_boards', projectKey });
    }
  }

  /**
   * Concurrent data fetching for dashboard generation
   */
  async getSprintDataConcurrently(projectKey: string, sprintId?: string): Promise<{
    sprint: JiraSprint;
    issues: JiraIssue[];
    board: JiraBoard;
    historicalSprints?: JiraSprint[];
  }> {
    PerformanceMonitor.startTimer(`concurrent_data_${projectKey}`);
    
    try {
      // First, get the board (needed for other operations)
      const boardsResponse = await this.getBoards(projectKey);
      const board = boardsResponse.values[0];
      
      // Prepare concurrent requests
      const requests: Promise<any>[] = [];
      
      // Sprint request
      const sprintPromise = sprintId 
        ? this.getSprint(parseInt(sprintId))
        : this.getActiveSprint(board.id);
      requests.push(sprintPromise);
      
      // Historical sprints request (for velocity analysis)
      const historyPromise = this.getSprintHistory(board.id, 6);
      requests.push(historyPromise);
      
      // Execute concurrent requests
      const [sprint, historyResponse] = await Promise.all(requests);
      
      if (!sprint) {
        throw new JiraError(
          `No ${sprintId ? 'sprint found with ID ' + sprintId : 'active sprint found'} for project '${projectKey}'`,
          'NO_SPRINT_FOUND',
          [
            sprintId ? 'Verify the sprint ID is correct' : 'Start a new sprint in your Scrum board',
            'Check if your project uses Scrum methodology',
            'Verify board permissions and configuration'
          ]
        );
      }
      
      // Get sprint issues
      const issuesResponse = await this.getSprintIssues(sprint.id);
      
      PerformanceMonitor.endTimer(`concurrent_data_${projectKey}`);
      
      return {
        sprint,
        issues: issuesResponse.issues,
        board,
        historicalSprints: historyResponse.values
      };
    } catch (error) {
      PerformanceMonitor.endTimer(`concurrent_data_${projectKey}`);
      throw ErrorHandler.categorizeAndHandle(error, { operation: 'get_sprint_data', projectKey });
    }
  }

  /**
   * Get active sprint with caching
   */
  async getActiveSprint(boardId: number): Promise<JiraSprint | null> {
    return this.cachedRequest(
      `active_sprint_${boardId}`,
      async () => {
        const response: AxiosResponse<{ values: JiraSprint[] }> = await this.client.get(
          `/rest/agile/1.0/board/${boardId}/sprint?state=active`
        );
        return response.data.values.length > 0 ? response.data.values[0] : null;
      },
      60000 // 1 minute cache for active sprint
    );
  }

  /**
   * Get sprint by ID with caching
   */
  async getSprint(sprintId: number): Promise<JiraSprint> {
    return this.cachedRequest(
      `sprint_${sprintId}`,
      async () => {
        const response: AxiosResponse<JiraSprint> = await this.client.get(`/rest/agile/1.0/sprint/${sprintId}`);
        return response.data;
      },
      300000 // 5 minutes cache for specific sprints
    );
  }

  /**
   * Get issues for a specific sprint with enhanced processing
   */
  async getSprintIssues(sprintId: number): Promise<{ issues: JiraIssue[] }> {
    return this.cachedRequest(
      `sprint_issues_${sprintId}`,
      async () => {
        const response: AxiosResponse<{ issues: JiraIssue[] }> = await this.client.get(
          `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=1000&expand=changelog`
        );
        return response.data;
      },
      120000 // 2 minutes cache for sprint issues (more dynamic)
    );
  }

  /**
   * Get sprint history with caching
   */
  async getSprintHistory(boardId: number, limit: number = 6): Promise<{ values: JiraSprint[] }> {
    return this.cachedRequest(
      `sprint_history_${boardId}_${limit}`,
      async () => {
        const response: AxiosResponse<{ values: JiraSprint[] }> = await this.client.get(
          `/rest/agile/1.0/board/${boardId}/sprint?state=closed&maxResults=${limit}&orderBy=-created`
        );
        return response.data;
      },
      600000 // 10 minutes cache for sprint history
    );
  }

  /**
   * Enhanced search with smart caching
   */
  async searchIssues(jql: string, options: { maxResults?: number; expand?: string; bypassCache?: boolean } = {}): Promise<{ issues: JiraIssue[]; total: number }> {
    const { maxResults = 1000, expand = 'changelog', bypassCache = false } = options;
    
    return this.cachedRequest(
      `search_${Buffer.from(jql).toString('base64')}_${maxResults}`,
      async () => {
        const encodedJql = encodeURIComponent(jql);
        const response: AxiosResponse<{ issues: JiraIssue[]; total: number }> = await this.client.get(
          `/rest/api/3/search?jql=${encodedJql}&maxResults=${maxResults}&expand=${expand}`
        );
        return response.data;
      },
      180000, // 3 minutes cache for searches
      bypassCache
    );
  }

  /**
   * Batch process multiple projects
   */
  async getMultipleProjectsData(projectKeys: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Process projects in batches to avoid overwhelming the API
    const batchSize = 3;
    for (let i = 0; i < projectKeys.length; i += batchSize) {
      const batch = projectKeys.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (projectKey) => {
        try {
          const data = await this.getSprintDataConcurrently(projectKey);
          results.set(projectKey, data);
        } catch (error) {
          console.warn(`Failed to get data for project ${projectKey}:`, (error as Error).message);
          results.set(projectKey, { error: (error as Error).message });
        }
      });
      
      await Promise.all(batchPromises);
      
      // Small delay between batches to be respectful to Jira API
      if (i + batchSize < projectKeys.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; hitRate: number; totalRequests: number } {
    return {
      entries: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for real implementation
      totalRequests: this.requestQueue.size
    };
  }

  /**
   * Clear cache (useful for testing or when data becomes stale)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Jira API cache cleared');
  }
}
