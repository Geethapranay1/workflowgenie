import { GitHubConnector } from '../integrations/github.js';
import { SlackConnector } from '../integrations/slack.js';
import { NotionConnector } from '../integrations/notion.js';
import { CalendarConnector } from '../integrations/calendar.js';
import { logger } from '../utils/logger.js';

export class WorkflowOrchestrator {
  constructor() {
    this.github = new GitHubConnector();
    this.slack = new SlackConnector();
    this.notion = new NotionConnector();
    this.calendar = new CalendarConnector();
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('Initializing WorkflowOrchestrator...');
    
    await this.github.initialize();
    await this.slack.initialize();
    await this.notion.initialize();
    await this.calendar.initialize();
    
    this.isInitialized = true;
    logger.info('WorkflowOrchestrator initialized successfully');
  }

  async scheduleCodeReview(args, userContext, requestId) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting code review workflow', {
        requestId,
        repository: args.repository,
        prNumber: args.pr_number
      });

      const prDetails = await this.github.getPullRequest(
        args.repository,
        args.pr_number,
        userContext.githubToken,
        requestId
      );

      const channelData = {
        name: `pr-${args.pr_number}-${prDetails.title}`,
        type: 'review',
        topic: `Code review for PR #${args.pr_number}`,
        purpose: `Review: ${prDetails.title}`,
        private: false,
        members: [],
        context: {
          purpose: `Code review for ${args.repository} PR #${args.pr_number}`,
          prNumber: args.pr_number,
          repository: args.repository,
          links: [
            {
              title: `Pull Request #${args.pr_number}`,
              url: prDetails.urls.html
            }
          ]
        }
      };

      const channel = await this.slack.createReviewChannel(
        channelData,
        userContext.slackToken,
        requestId
      );

      await this.slack.sendPullRequestMessage(
        channel.id,
        prDetails,
        userContext.slackToken,
        requestId
      );

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        message: `Code review scheduled for PR #${args.pr_number}`,
        executionTime: `${executionTime}ms`,
        details: {
          repository: args.repository,
          pr_number: args.pr_number,
          slack_channel: `#${channel.name}`,
          github_pr: prDetails.urls.html,
          meeting: {
            time: 'Will be scheduled based on team availability',
            attendees: prDetails.requestedReviewers.map(r => r.name)
          }
        }
      };

    } catch (error) {
      logger.error('Code review workflow failed', {
        requestId,
        error: error.message
      });

      return {
        success: false,
        message: `Failed to schedule code review: ${error.message}`,
        executionTime: `${Date.now() - startTime}ms`
      };
    }
  }

  async createProjectKickoff(args, userContext, requestId) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting project kickoff workflow', {
        requestId,
        projectName: args.project_name,
        teamSize: args.team_members.length
      });

      // 1. Create Notion project space
      const notionProject = await this.notion.createProjectPage({
        name: args.project_name,
        databaseId: process.env.NOTION_PROJECTS_DB_ID,
        teamMembers: args.team_members,
        deadline: args.deadline,
        description: args.description
      }, userContext.notionToken, requestId);

      // 2. Create GitHub repository
      const repoName = args.project_name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const repository = await this.github.createRepository({
        name: repoName,
        description: args.description,
        private: true,
        team: args.team_members
      }, userContext.githubToken, requestId);

      // 3. Create Slack channel
      const channelData = {
        name: `proj-${repoName}`,
        topic: `${args.project_name} - Project Discussion`,
        purpose: args.description,
        private: false,
        members: args.team_members
      };

      const channel = await this.slack.createReviewChannel(
        channelData,
        userContext.slackToken,
        requestId
      );

      // 4. Schedule kickoff meeting
      const kickoffTime = await this.calendar.findOptimalTime(
        args.team_members,
        userContext.calendarToken,
        requestId,
        {
          duration: 60,
          timeMin: new Date(),
          timeMax: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Within 2 days
          workingHours: { start: 9, end: 17 }
        }
      );

      const meeting = await this.calendar.createMeeting({
        title: `${args.project_name} - Project Kickoff`,
        description: `Project kickoff meeting for ${args.project_name}\n\nNotion: ${notionProject.projectPageUrl}\nGitHub: ${repository.html_url}\nSlack: ${channel.webUrl}`,
        startTime: kickoffTime.start,
        endTime: kickoffTime.end,
        attendees: args.team_members,
        location: channel.webUrl // Slack channel link
      }, userContext.calendarToken, requestId);

      // 5. Send welcome message in Slack
      await this.slack.sendMessage(
        channel.id,
        {
          text: `🚀 *Project ${args.project_name} has been created!*\n\n` +
                `*Resources:*\n` +
                `• Notion Workspace: ${notionProject.projectPageUrl}\n` +
                `• GitHub Repository: ${repository.html_url}\n` +
                `• Kickoff Meeting: ${meeting.htmlLink}\n\n` +
                `Please review the project documentation in Notion and we'll discuss everything in detail during the kickoff meeting.`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `🚀 Project ${args.project_name} has been created!`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Welcome to the project channel! All project-related discussions will happen here.`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Important Links:*'
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*📝 Notion Workspace*\n<${notionProject.projectPageUrl}|Open Documentation>`
                },
                {
                  type: 'mrkdwn',
                  text: `*📊 GitHub Repository*\n<${repository.html_url}|${repository.name}>`
                }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🗓 Kickoff Meeting*\n${meeting.summary}\n${meeting.htmlLink}`
              }
            }
          ]
        },
        userContext.slackToken,
        requestId
      );

      const executionTime = Date.now() - startTime;

      logger.info('Project kickoff completed successfully', {
        requestId,
        projectName: args.project_name,
        notionPageId: notionProject.projectPageId,
        repoName: repository.name,
        slackChannel: channel.name,
        executionTime: `${executionTime}ms`
      });

      return {
        success: true,
        message: `Project ${args.project_name} created successfully`,
        executionTime: `${executionTime}ms`,
        details: {
          notion: {
            pageId: notionProject.projectPageId,
            url: notionProject.projectPageUrl
          },
          github: {
            name: repository.name,
            url: repository.html_url
          },
          slack: {
            channel: channel.name,
            url: channel.webUrl
          },
          meeting: {
            id: meeting.id,
            time: meeting.start.dateTime,
            url: meeting.htmlLink
          }
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Project kickoff workflow failed', {
        requestId,
        error: error.message,
        projectName: args.project_name
      });

      return {
        success: false,
        message: `Failed to create project: ${error.message}`,
        executionTime: `${executionTime}ms`
      };
    }
  }

  async handleIncidentResponse(args, userContext, requestId) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting incident response workflow', {
        requestId,
        severity: args.severity,
        description: args.description
      });

      // 1. Create Notion incident page
      const notionIncident = await this.notion.createDocument(
        process.env.NOTION_INCIDENTS_DB_ID,
        {
          title: `Incident: ${args.title}`,
          type: 'Incident Report',
          content: args.description,
          owners: args.responders
        },
        userContext.notionToken,
        requestId
      );

      // 2. Create GitHub issue
      const issueData = {
        title: `[INCIDENT] ${args.title}`,
        body: `## Incident Report\n\n${args.description}\n\n` +
              `**Severity:** ${args.severity}\n` +
              `**Started:** ${new Date().toISOString()}\n\n` +
              `### Links\n` +
              `- [Incident Doc](${notionIncident.url})\n`,
        labels: ['incident', `severity:${args.severity}`],
        assignees: args.responders.map(email => email.split('@')[0]) // Convert emails to GitHub usernames
      };

      const issue = await this.github.createIssue(
        args.repository,
        issueData,
        userContext.githubToken,
        requestId
      );

      // 3. Create Slack channel for incident coordination
      const channelData = {
        name: `incident-${Date.now().toString().slice(-6)}`,
        topic: `🚨 Active Incident: ${args.title}`,
        purpose: `Incident coordination - ${args.description.slice(0, 100)}...`,
        private: true,
        members: [...args.responders, ...(args.stakeholders || [])]
      };

      const channel = await this.slack.createReviewChannel(
        channelData,
        userContext.slackToken,
        requestId
      );

      // 4. Send initial incident notification
      await this.slack.sendMessage(
        channel.id,
        {
          text: `🚨 *New Incident Reported*\n\n` +
                `*Title:* ${args.title}\n` +
                `*Severity:* ${args.severity}\n\n` +
                `*Description:*\n${args.description}\n\n` +
                `*Resources:*\n` +
                `• Incident Doc: ${notionIncident.url}\n` +
                `• GitHub Issue: ${issue.html_url}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🚨 New Incident Reported'
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Title:*\n${args.title}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Severity:*\n${args.severity}`
                }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Description:*\n${args.description}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Resources:*'
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*📝 Incident Doc*\n<${notionIncident.url}|View Documentation>`
                },
                {
                  type: 'mrkdwn',
                  text: `*📊 GitHub Issue*\n<${issue.html_url}|#${issue.number}>`
                }
              ]
            }
          ]
        },
        userContext.slackToken,
        requestId
      );

      // 5. If high severity, trigger immediate meeting
      if (args.severity === 'high' || args.severity === 'critical') {
        const meeting = await this.calendar.createMeeting({
          title: `🚨 Incident Response: ${args.title}`,
          description: `Emergency response meeting for ongoing incident\n\n` +
                      `Notion: ${notionIncident.url}\n` +
                      `GitHub: ${issue.html_url}\n` +
                      `Slack: ${channel.webUrl}`,
          startTime: new Date(), // Start immediately
          endTime: new Date(Date.now() + 30 * 60 * 1000), // 30 min duration
          attendees: args.responders,
          location: channel.webUrl,
          conferenceData: {
            createRequest: { requestId: `incident-${Date.now()}` }
          }
        }, userContext.calendarToken, requestId);

        // Send meeting notification
        await this.slack.sendMessage(
          channel.id,
          {
            text: `🚪 *Emergency Response Meeting*\n\n` +
                  `Join now: ${meeting.hangoutLink || meeting.htmlLink}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🚪 *Emergency Response Meeting Created*\n\n` +
                        `Please join immediately: ${meeting.hangoutLink || meeting.htmlLink}`
                }
              }
            ]
          },
          userContext.slackToken,
          requestId
        );
      }

      const executionTime = Date.now() - startTime;

      logger.info('Incident response workflow completed', {
        requestId,
        incidentId: notionIncident.id,
        issueNumber: issue.number,
        slackChannel: channel.name,
        executionTime: `${executionTime}ms`
      });

      return {
        success: true,
        message: `Incident response initiated: ${args.title}`,
        executionTime: `${executionTime}ms`,
        details: {
          notion: {
            documentId: notionIncident.id,
            url: notionIncident.url
          },
          github: {
            issueNumber: issue.number,
            url: issue.html_url
          },
          slack: {
            channel: channel.name,
            url: channel.webUrl
          }
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Incident response workflow failed', {
        requestId,
        error: error.message
      });

      return {
        success: false,
        message: `Failed to initiate incident response: ${error.message}`,
        executionTime: `${executionTime}ms`
      };
    }
  }

  async cleanup() {
    logger.info('Cleaning up WorkflowOrchestrator...');
    
    if (this.github) {
      await this.github.cleanup();
    }
    
    if (this.slack) {
      await this.slack.cleanup();
    }

    if (this.notion) {
      await this.notion.cleanup();
    }

    if (this.calendar) {
      await this.calendar.cleanup();
    }
    
    logger.info('WorkflowOrchestrator cleanup complete');
  }
}