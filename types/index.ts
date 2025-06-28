// Jira API Response Types
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  timeout?: number;
  maxRetries?: number;
  cacheTTL?: number;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  simplified: boolean;
  style: string;
  isPrivate: boolean;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location: {
    projectId: number;
    projectName: string;
    projectKey: string;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
  boardId: number;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    priority: {
      name: string;
      id: string;
    };
    issuetype: {
      name: string;
      id: string;
      subtask: boolean;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter: {
      displayName: string;
      emailAddress: string;
    };
    created: string;
    updated: string;
    resolutiondate?: string;
    customfield_10016?: number; // Story Points (may vary by instance)
    issuelinks?: Array<{
      type: {
        name: string;
        inward: string;
        outward: string;
      };
      inwardIssue?: JiraIssue;
      outwardIssue?: JiraIssue;
    }>;
  };
  changelog?: {
    histories: Array<{
      created: string;
      items: Array<{
        field: string;
        fromString?: string;
        toString?: string;
      }>;
    }>;
  };
}

// Dashboard Data Types
export interface BurndownPoint {
  date: string;
  remaining: number;
  dayNumber: number;
}

export interface SprintBurndownData {
  meta: {
    title: string;
    project: string;
    generatedAt: string;
  };
  sprint: {
    id: number;
    name: string;
    goal: string;
    startDate: string;
    endDate: string;
    state: string;
  };
  burndown: {
    ideal: BurndownPoint[];
    actual: BurndownPoint[];
    currentRemaining: number;
    totalPoints: number;
  };
  insights: string[];
}

export interface VelocitySprintData {
  sprintName: string;
  sprintId: number;
  startDate: string;
  endDate: string;
  completedPoints: number;
  plannedPoints: number;
  completionRate: number;
}

export interface TeamVelocityData {
  meta: {
    title: string;
    project: string;
    sprintCount: number;
    generatedAt: string;
  };
  velocity: {
    sprints: VelocitySprintData[];
    averageVelocity: number;
    trend: string;
    predictedNext: number;
    consistency: number;
  };
  insights: string[];
}

export interface GoalProgressData {
  meta: {
    title: string;
    project: string;
    generatedAt: string;
  };
  sprint: {
    id: number;
    name: string;
    goal: string;
    startDate: string;
    endDate: string;
  };
  progress: {
    totalIssues: number;
    goalRelatedIssues: number;
    goalCompletedIssues: number;
    goalCompletionRate: number;
    overallCompletionRate: number;
    timeElapsed: number;
    workCompleted: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byAssignee: Record<string, number>;
  };
  insights: string[];
}

export interface BlockedIssueData {
  key: string;
  summary: string;
  priority: string;
  assignee: string;
  status: string;
  blockedSince: string;
  blockedDays: number;
  blockingReason: string;
}

export interface BlockedIssuesData {
  meta: {
    title: string;
    project: string;
    generatedAt: string;
  };
  summary: {
    totalBlocked: number;
    criticalBlocked: number;
    averageBlockedDays: number;
    oldestBlocked: number;
  };
  blockedIssues: BlockedIssueData[];
  insights: string[];
}

export interface SprintHealthData {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  color: string;
  factors: {
    burndownHealth: number;
    velocityHealth: number;
    goalHealth: number;
    blockerHealth: number;
  };
}

export interface ComprehensiveDashboardData {
  meta: {
    title: string;
    project: string;
    generatedAt: string;
    jiraUrl: string;
  };
  sprint: JiraSprint;
  metrics: {
    burndown: SprintBurndownData['burndown'];
    velocity: TeamVelocityData['velocity'];
    goalProgress: GoalProgressData['progress'];
    blockedIssues: BlockedIssuesData['summary'];
  };
  health: SprintHealthData;
  insights: string[];
}

// MCP Tool Response Types
export interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

// Error Types
export class JiraApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
