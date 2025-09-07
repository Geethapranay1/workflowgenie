import { GitHubConnector } from '../integrations/github.js';
import { SlackConnector } from '../integrations/slack.js';
import { NotionConnector } from '../integrations/notion.js';
import { CalendarConnector } from '../integrations/calendar.js';
import { WorkflowAutomation } from './workflow-automation.js';
import { defaultWorkflowConfig } from '../config/workflow-config.js';
import { logger } from '../utils/logger.js';

export class WorkflowOrchestrator {
  constructor(config = {}) {
    this.github = new GitHubConnector();
    this.slack = new SlackConnector();
    this.notion = new NotionConnector();
    this.calendar = new CalendarConnector();
    this.automation = new WorkflowAutomation(this, config);
    this.config = {
      ...defaultWorkflowConfig,
      ...config
    };
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
        prNumber: args.pr_number,
        issueNumber: args.issue_number
      });

      // 1. Get PR and related issue details
      const [prDetails, issueDetails] = await Promise.all([
        this.github.getPullRequest(
          args.repository,
          args.pr_number,
          userContext.githubToken,
          requestId
        ),
        this.github.getIssue(
          args.repository,
          args.issue_number,
          userContext.githubToken,
          requestId
        )
      ]);

      // 2. Find optimal meeting time for all reviewers
      const attendees = [
        ...prDetails.requestedReviewers.map(r => r.email),
        prDetails.author.email,
        ...args.additional_attendees || []
      ].filter(Boolean); // Remove any undefined emails

      const meetingTime = await this.calendar.findOptimalTime(
        attendees,
        userContext.calendarToken,
        requestId,
        {
          duration: args.duration || 30,
          timeMin: new Date(Date.now() + 30 * 60 * 1000), // Start at least 30 mins from now
          timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000), // Within next 24 hours
          workingHours: { start: 9, end: 17 },
          bufferMinutes: 15
        }
      );

      // 3. Create Slack channel for discussion
      const channelData = {
        name: `pr-${args.pr_number}-${prDetails.title.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.substring(0, 80),
        type: 'review',
        topic: `Code review for PR #${args.pr_number}: ${prDetails.title}`,
        purpose: `Review: ${prDetails.title} (Fixes #${args.issue_number})`,
        private: false,
        members: attendees.map(email => email.split('@')[0]), // Convert emails to Slack usernames
        context: {
          purpose: `Code review for ${args.repository} PR #${args.pr_number}`,
          prNumber: args.pr_number,
          issueNumber: args.issue_number,
          repository: args.repository,
          links: [
            {
              title: `Pull Request #${args.pr_number}`,
              url: prDetails.urls.html
            },
            {
              title: `Issue #${args.issue_number}`,
              url: issueDetails.html_url
            }
          ]
        }
      };

      const channel = await this.slack.createReviewChannel(
        channelData,
        userContext.slackToken,
        requestId
      );

      // 4. Schedule Google Meet
      const meeting = await this.calendar.createMeeting({
        title: `Code Review: ${prDetails.title}`,
        description: `Code review for PR #${args.pr_number} (Fixes #${args.issue_number})\n\n` +
                    `Pull Request: ${prDetails.urls.html}\n` +
                    `Issue: ${issueDetails.html_url}\n` +
                    `Slack Channel: ${channel.webUrl}\n\n` +
                    `Changes Summary:\n` +
                    `- Files changed: ${prDetails.stats.changedFiles}\n` +
                    `- Additions: +${prDetails.stats.additions}\n` +
                    `- Deletions: -${prDetails.stats.deletions}\n\n` +
                    `Please review the changes before the meeting.`,
        startTime: meetingTime.start,
        endTime: meetingTime.end,
        attendees: attendees,
        location: channel.webUrl, // Link to Slack channel
        conferenceData: {
          createRequest: { requestId: `pr-${args.pr_number}` }
        }
      }, userContext.calendarToken, requestId);

      // 5. Create Notion page for meeting notes
      const notionPage = await this.notion.createDocument(
        process.env.NOTION_PROJECTS_DB_ID,
        {
          title: `Code Review: ${prDetails.title}`,
          type: 'Meeting Notes',
          content: `# Code Review Meeting Notes\n\n` +
                  `## Pull Request Details\n` +
                  `- PR: #${args.pr_number} - ${prDetails.title}\n` +
                  `- Author: ${prDetails.author.name}\n` +
                  `- Reviewers: ${prDetails.requestedReviewers.map(r => r.name).join(', ')}\n` +
                  `- Issue: #${args.issue_number}\n\n` +
                  `## Links\n` +
                  `- [Pull Request](${prDetails.urls.html})\n` +
                  `- [Issue](${issueDetails.html_url})\n` +
                  `- [Slack Channel](${channel.webUrl})\n` +
                  `- [Meeting Recording](TBD)\n\n` +
                  `## Agenda\n` +
                  `1. PR Overview by Author\n` +
                  `2. Technical Implementation Review\n` +
                  `3. Testing Strategy Discussion\n` +
                  `4. Action Items\n\n` +
                  `## Notes\n` +
                  `(To be filled during the meeting)\n\n` +
                  `## Action Items\n` +
                  `- [ ] Review comments addressed\n` +
                  `- [ ] Tests updated/added\n` +
                  `- [ ] Documentation updated\n\n` +
                  `## Next Steps\n` +
                  `(To be determined during the meeting)`,
          owners: attendees
        },
        userContext.notionToken,
        requestId
      );

      // 6. Send comprehensive Slack notification
      await this.slack.sendMessage(
        channel.id,
        {
          text: `🔍 *Code Review Scheduled: ${prDetails.title}*\n\n` +
                `*Pull Request:* #${args.pr_number}\n` +
                `*Fixes Issue:* #${args.issue_number}\n` +
                `*Author:* ${prDetails.author.name}\n\n` +
                `*Meeting Scheduled:* ${meetingTime.formatted}\n` +
                `*Join:* ${meeting.hangoutLink || meeting.htmlLink}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `🔍 Code Review: ${prDetails.title}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Pull Request:*\n<${prDetails.urls.html}|#${args.pr_number}>`
                },
                {
                  type: 'mrkdwn',
                  text: `*Fixes Issue:*\n<${issueDetails.html_url}|#${args.issue_number}>`
                }
              ]
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Author:*\n${prDetails.author.name}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Reviewers:*\n${prDetails.requestedReviewers.map(r => r.name).join(', ')}`
                }
              ]
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Meeting Time:*\n${meetingTime.formatted}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Changes:*\n${prDetails.stats.changedFiles} files (+${prDetails.stats.additions}, -${prDetails.stats.deletions})`
                }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Important Links:*\n• <${meeting.hangoutLink || meeting.htmlLink}|Join Meeting>\n• <${notionPage.url}|Meeting Notes>\n• <${prDetails.urls.html}|Pull Request>\n• <${issueDetails.html_url}|Issue>`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `🔔 You'll receive a calendar invitation shortly. Please review the PR before the meeting.`
                }
              ]
            }
          ]
        },
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
          issue_number: args.issue_number,
          slack_channel: `#${channel.name}`,
          slack_url: channel.webUrl,
          github_pr: prDetails.urls.html,
          github_issue: issueDetails.html_url,
          meeting: {
            time: meetingTime.formatted,
            url: meeting.hangoutLink || meeting.htmlLink,
            attendees: attendees
          },
          notion: {
            title: `Code Review: ${prDetails.title}`,
            url: notionPage.url
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