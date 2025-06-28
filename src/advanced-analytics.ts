import { JiraApiClient } from './jira-client.js';
import { JiraSprint, JiraIssue } from '../types/index.js';
import { PerformanceMonitor } from './error-handler.js';

/**
 * Advanced Analytics Engine - Week 4 Implementation
 * Features: Predictive analytics, cross-sprint analysis, anomaly detection, risk assessment
 */

export interface PredictiveAnalytics {
  sprintCompletion: {
    predictedCompletionDate: string;
    confidenceLevel: number;
    remainingDays: number;
    velocityBasedForecast: number;
  };
  riskFactors: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    factors: string[];
    recommendations: string[];
  };
  trends: {
    velocityTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    qualityTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    deliveryTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
}

export interface CrossSprintInsights {
  portfolioHealth: number;
  totalProjects: number;
  activeProjects: number;
  averageVelocity: number;
  totalBlockedIssues: number;
  criticalRisks: string[];
  topPerformingTeams: string[];
  bottleneckProjects: string[];
}

export interface TeamPerformance {
  teamName: string;
  averageVelocity: number;
  completionRate: number;
  bugRate: number;
  leadTime: number;
  cycleTime: number;
  throughput: number;
  predictedCapacity: number;
}

export interface AnomalyDetection {
  detected: boolean;
  anomalies: {
    type: 'VELOCITY_DROP' | 'SCOPE_CREEP' | 'QUALITY_ISSUE' | 'DELIVERY_DELAY';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    impact: string;
    recommendation: string;
  }[];
}

export class AdvancedAnalyticsEngine {
  constructor(private jiraClient: JiraApiClient) {}

  /**
   * Generate predictive analytics for sprint completion
   */
  async generatePredictiveAnalytics(projectKey: string, sprintId?: string): Promise<PredictiveAnalytics> {
    PerformanceMonitor.startTimer('predictive_analytics');
    
    try {
      const { sprint, issues, historicalSprints } = await this.jiraClient.getSprintDataConcurrently(projectKey, sprintId);
      
      // Calculate current progress
      const totalStoryPoints = this.getTotalStoryPoints(issues);
      const completedStoryPoints = this.getCompletedStoryPoints(issues);
      const remainingStoryPoints = totalStoryPoints - completedStoryPoints;
      
      // Calculate historical velocity
      const historicalVelocity = await this.calculateHistoricalVelocity(historicalSprints || []);
      
      // Predict completion date
      const sprintStart = new Date(sprint.startDate!);
      const sprintEnd = new Date(sprint.endDate!);
      const totalSprintDays = Math.ceil((sprintEnd.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
      const daysElapsed = Math.ceil((Date.now() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
      const remainingDays = Math.max(0, totalSprintDays - daysElapsed);
      
      // Velocity-based forecasting
      const currentDailyVelocity = daysElapsed > 0 ? completedStoryPoints / daysElapsed : 0;
      const historicalDailyVelocity = historicalVelocity.average / totalSprintDays;
      const predictedDailyVelocity = Math.max(currentDailyVelocity, historicalDailyVelocity * 0.8);
      
      const daysToCompletion = predictedDailyVelocity > 0 ? remainingStoryPoints / predictedDailyVelocity : remainingDays;
      const predictedCompletionDate = new Date(Date.now() + daysToCompletion * 24 * 60 * 60 * 1000);
      
      // Calculate confidence level
      const progressRate = totalStoryPoints > 0 ? completedStoryPoints / totalStoryPoints : 0;
      const timeRate = daysElapsed / totalSprintDays;
      const confidenceLevel = Math.min(100, Math.max(0, (1 - Math.abs(progressRate - timeRate)) * 100));
      
      // Risk assessment
      const riskFactors = this.assessRiskFactors(sprint, issues, remainingDays, progressRate);
      
      // Trend analysis
      const trends = this.analyzeTrends(historicalSprints || [], issues);
      
      PerformanceMonitor.endTimer('predictive_analytics');
      
      return {
        sprintCompletion: {
          predictedCompletionDate: predictedCompletionDate.toISOString().split('T')[0],
          confidenceLevel: Math.round(confidenceLevel),
          remainingDays,
          velocityBasedForecast: Math.round(predictedDailyVelocity * remainingDays)
        },
        riskFactors,
        trends
      };
    } catch (error) {
      PerformanceMonitor.endTimer('predictive_analytics');
      throw error;
    }
  }

  /**
   * Cross-sprint portfolio analysis
   */
  async generateCrossSprintInsights(projectKeys: string[]): Promise<CrossSprintInsights> {
    PerformanceMonitor.startTimer('cross_sprint_analysis');
    
    try {
      const projectsData = await this.jiraClient.getMultipleProjectsData(projectKeys);
      
      let totalVelocity = 0;
      let totalBlockedIssues = 0;
      let activeProjects = 0;
      const criticalRisks: string[] = [];
      const teamPerformance: { project: string; velocity: number; health: number }[] = [];
      
      for (const [projectKey, data] of projectsData.entries()) {
        if (data.error) {
          criticalRisks.push(`Project ${projectKey}: ${data.error}`);
          continue;
        }
        
        activeProjects++;
        
        // Calculate project metrics
        const velocity = this.getCompletedStoryPoints(data.issues);
        totalVelocity += velocity;
        
        // Count blocked issues
        const blockedCount = data.issues.filter((issue: JiraIssue) => 
          issue.fields.status.name.toLowerCase().includes('blocked') ||
          issue.fields.status.name.toLowerCase().includes('impediment')
        ).length;
        totalBlockedIssues += blockedCount;
        
        // Health calculation
        const totalPoints = this.getTotalStoryPoints(data.issues);
        const health = totalPoints > 0 ? (velocity / totalPoints) * 100 : 0;
        
        teamPerformance.push({ project: projectKey, velocity, health });
        
        // Risk assessment
        if (health < 50) {
          criticalRisks.push(`${projectKey}: Low completion rate (${Math.round(health)}%)`);
        }
        if (blockedCount > 3) {
          criticalRisks.push(`${projectKey}: High blocked issues count (${blockedCount})`);
        }
      }
      
      // Sort teams by performance
      teamPerformance.sort((a, b) => b.health - a.health);
      const topPerformingTeams = teamPerformance.slice(0, 3).map(t => t.project);
      const bottleneckProjects = teamPerformance.slice(-2).map(t => t.project);
      
      const portfolioHealth = activeProjects > 0 ? 
        teamPerformance.reduce((sum, t) => sum + t.health, 0) / activeProjects : 0;
      
      PerformanceMonitor.endTimer('cross_sprint_analysis');
      
      return {
        portfolioHealth: Math.round(portfolioHealth),
        totalProjects: projectKeys.length,
        activeProjects,
        averageVelocity: Math.round(totalVelocity / Math.max(1, activeProjects)),
        totalBlockedIssues,
        criticalRisks: criticalRisks.slice(0, 5), // Top 5 risks
        topPerformingTeams,
        bottleneckProjects
      };
    } catch (error) {
      PerformanceMonitor.endTimer('cross_sprint_analysis');
      throw error;
    }
  }

  /**
   * Anomaly detection in sprint patterns
   */
  async detectAnomalies(projectKey: string, sprintId?: string): Promise<AnomalyDetection> {
    try {
      const { sprint, issues, historicalSprints } = await this.jiraClient.getSprintDataConcurrently(projectKey, sprintId);
      
      const anomalies: AnomalyDetection['anomalies'] = [];
      
      // Velocity anomaly detection
      const currentVelocity = this.getCompletedStoryPoints(issues);
      const historicalVelocity = await this.calculateHistoricalVelocity(historicalSprints || []);
      
      if (currentVelocity < historicalVelocity.average * 0.7) {
        anomalies.push({
          type: 'VELOCITY_DROP',
          severity: 'HIGH',
          description: `Current velocity (${currentVelocity}) is significantly below historical average (${historicalVelocity.average})`,
          impact: 'Sprint goals may not be achieved on time',
          recommendation: 'Review team capacity, remove impediments, or adjust scope'
        });
      }
      
      // Scope creep detection
      const sprintStart = new Date(sprint.startDate!);
      const daysElapsed = Math.ceil((Date.now() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
      const addedIssues = issues.filter(issue => {
        const created = new Date(issue.fields.created);
        return created > sprintStart;
      });
      
      if (addedIssues.length > issues.length * 0.2) {
        anomalies.push({
          type: 'SCOPE_CREEP',
          severity: 'MEDIUM',
          description: `${addedIssues.length} issues added after sprint start (${Math.round(addedIssues.length / issues.length * 100)}% of total)`,
          impact: 'Original sprint goals may be compromised',
          recommendation: 'Review scope changes and prioritize original commitments'
        });
      }
      
      // Quality issues detection
      const bugCount = issues.filter(issue => 
        issue.fields.issuetype.name.toLowerCase().includes('bug')
      ).length;
      const bugRate = issues.length > 0 ? bugCount / issues.length : 0;
      
      if (bugRate > 0.3) {
        anomalies.push({
          type: 'QUALITY_ISSUE',
          severity: 'HIGH',
          description: `High bug rate detected: ${bugCount} bugs out of ${issues.length} total issues (${Math.round(bugRate * 100)}%)`,
          impact: 'Development velocity and team morale may be affected',
          recommendation: 'Implement code reviews, increase testing, address technical debt'
        });
      }
      
      // Delivery delay detection
      const completionRate = this.getCompletedStoryPoints(issues) / Math.max(1, this.getTotalStoryPoints(issues));
      const timeRate = daysElapsed / Math.max(1, Math.ceil((new Date(sprint.endDate!).getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (timeRate > 0.8 && completionRate < 0.6) {
        anomalies.push({
          type: 'DELIVERY_DELAY',
          severity: 'HIGH',
          description: `Sprint is ${Math.round(timeRate * 100)}% complete by time but only ${Math.round(completionRate * 100)}% complete by work`,
          impact: 'Sprint goals are at risk of not being delivered',
          recommendation: 'Focus on completing highest priority items, consider scope reduction'
        });
      }
      
      return {
        detected: anomalies.length > 0,
        anomalies
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Team performance analysis
   */
  async analyzeTeamPerformance(projectKey: string): Promise<TeamPerformance> {
    try {
      const { sprint, issues, historicalSprints } = await this.jiraClient.getSprintDataConcurrently(projectKey);
      
      // Calculate metrics
      const historicalVelocity = await this.calculateHistoricalVelocity(historicalSprints || []);
      const completionRate = this.getCompletedStoryPoints(issues) / Math.max(1, this.getTotalStoryPoints(issues));
      
      // Bug rate calculation
      const bugCount = issues.filter(issue => 
        issue.fields.issuetype.name.toLowerCase().includes('bug')
      ).length;
      const bugRate = issues.length > 0 ? bugCount / issues.length : 0;
      
      // Lead time calculation (simplified)
      const completedIssues = issues.filter(issue => this.isIssueCompleted(issue));
      const avgLeadTime = completedIssues.length > 0 ? 
        completedIssues.reduce((sum, issue) => {
          const created = new Date(issue.fields.created);
          const resolved = new Date(issue.fields.resolutiondate || Date.now());
          return sum + Math.ceil((resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / completedIssues.length : 0;
      
      // Predictive capacity
      const predictedCapacity = Math.round(historicalVelocity.average * 1.1); // 10% optimistic forecast
      
      return {
        teamName: projectKey,
        averageVelocity: historicalVelocity.average,
        completionRate: Math.round(completionRate * 100),
        bugRate: Math.round(bugRate * 100),
        leadTime: Math.round(avgLeadTime),
        cycleTime: Math.round(avgLeadTime * 0.7), // Simplified estimate
        throughput: completedIssues.length,
        predictedCapacity
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private async calculateHistoricalVelocity(sprints: JiraSprint[]): Promise<{ average: number; trend: string }> {
    if (sprints.length === 0) return { average: 0, trend: 'UNKNOWN' };
    
    const velocities: number[] = [];
    
    for (const sprint of sprints.slice(0, 6)) {
      try {
        const issues = await this.jiraClient.getSprintIssues(sprint.id);
        const velocity = this.getCompletedStoryPoints(issues.issues);
        velocities.push(velocity);
      } catch {
        // Skip sprints with data issues
      }
    }
    
    const average = velocities.length > 0 ? 
      Math.round(velocities.reduce((sum, v) => sum + v, 0) / velocities.length) : 0;
    
    // Trend calculation
    let trend = 'STABLE';
    if (velocities.length >= 3) {
      const recent = velocities.slice(0, 2).reduce((sum, v) => sum + v, 0) / 2;
      const older = velocities.slice(2, 4).reduce((sum, v) => sum + v, 0) / 2;
      
      if (recent > older * 1.1) trend = 'IMPROVING';
      else if (recent < older * 0.9) trend = 'DECLINING';
    }
    
    return { average, trend };
  }

  private getTotalStoryPoints(issues: JiraIssue[]): number {
    return issues.reduce((total, issue) => total + this.getStoryPoints(issue), 0);
  }

  private getCompletedStoryPoints(issues: JiraIssue[]): number {
    return issues
      .filter(issue => this.isIssueCompleted(issue))
      .reduce((total, issue) => total + this.getStoryPoints(issue), 0);
  }

  private getStoryPoints(issue: JiraIssue): number {
    const fields = issue.fields as any;
    const storyPoints = 
      fields.customfield_10016 || 
      fields.customfield_10024 || 
      fields.customfield_10008 || 
      0;
    return typeof storyPoints === 'number' ? storyPoints : 0;
  }

  private isIssueCompleted(issue: JiraIssue): boolean {
    const status = issue.fields.status.statusCategory.key;
    return status === 'done';
  }

  private assessRiskFactors(sprint: JiraSprint, issues: JiraIssue[], remainingDays: number, progressRate: number): PredictiveAnalytics['riskFactors'] {
    const factors: string[] = [];
    const recommendations: string[] = [];
    
    if (progressRate < 0.5 && remainingDays < 3) {
      factors.push('Low completion rate with limited time remaining');
      recommendations.push('Focus on highest priority items only');
    }
    
    const blockedCount = issues.filter(issue => 
      issue.fields.status.name.toLowerCase().includes('blocked')
    ).length;
    
    if (blockedCount > 2) {
      factors.push(`${blockedCount} blocked issues detected`);
      recommendations.push('Prioritize removing impediments');
    }
    
    if (remainingDays <= 0) {
      factors.push('Sprint deadline passed');
      recommendations.push('Complete sprint review and plan next sprint');
    }
    
    let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (factors.length >= 3) level = 'CRITICAL';
    else if (factors.length >= 2) level = 'HIGH';
    else if (factors.length >= 1) level = 'MEDIUM';
    
    return { level, factors, recommendations };
  }

  private analyzeTrends(historicalSprints: JiraSprint[], currentIssues: JiraIssue[]): PredictiveAnalytics['trends'] {
    // Simplified trend analysis
    return {
      velocityTrend: 'STABLE', // Would need more complex calculation
      qualityTrend: 'STABLE',
      deliveryTrend: 'STABLE'
    };
  }
}
