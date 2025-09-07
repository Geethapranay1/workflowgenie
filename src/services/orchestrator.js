import { GitHubConnector } from '../integrations/github.js';
import { SlackConnector } from '../integrations/slack.js';
import { CalendarConnector } from '../integrations/calendar.js';
import { NotionConnector } from '../integrations/notion.js';
import { logger } from '../utils/logger.js';

export class WorkflowOrchestrator {
  constructor() {
    this.github = new GitHubConnector();
    this.slack = new SlackConnector();
    this.calendar = new CalendarConnector();
    this.notion = new NotionConnector();
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('Initializing WorkflowOrchestrator...');
    
    await this.github.initialize();
    await this.slack.initialize();
    await this.calendar.initialize();
    await this.notion.initialize();
    
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
        urgency: args.urgency || 'medium'
      });

      // Step 1: Fetch PR details from GitHub
      const prDetails = await this.github.getPullRequest(
        args.repository,
        args.pr_number,
        userContext.githubToken,
        requestId
      );

      // Step 2: Create a Slack channel for the review
      const channelData = {
        name: `pr-${args.pr_number}-${prDetails.title.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 20)}`,
        type: 'review',
        topic: `Code review for PR #${args.pr_number}`,
        purpose: `Review: ${prDetails.title}`,
        private: false,
        members: prDetails.requestedReviewers.map(r => r.email).filter(Boolean),
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

      // Step 3: Find optimal meeting time based on attendees' calendars
      const reviewers = prDetails.requestedReviewers.filter(r => r.email);
      const attendees = [
        { email: prDetails.author.email, optional: false },
        ...reviewers.map(r => ({ email: r.email, optional: false }))
      ];

      // Filter out attendees without email addresses
      const validAttendees = attendees.filter(a => a.email);

      if (validAttendees.length === 0) {
        throw new Error('No valid email addresses found for meeting attendees');
      }

      // Calculate meeting duration and priority based on PR complexity and urgency
      const meetingDuration = this.calculateMeetingDuration(prDetails, args.urgency);
      
      // Set meeting preferences based on PR urgency
      const meetingPreferences = this.getMeetingPreferences(args.urgency, prDetails);

      // Find optimal meeting time
      const optimalTime = await this.calendar.findOptimalTime(
        validAttendees,
        userContext.calendarToken,
        requestId,
        meetingPreferences
      );

      // Step 4: Schedule calendar meeting
      const meetingData = {
        title: `Code Review: PR #${args.pr_number} - ${prDetails.title}`,
        description: this.generateMeetingDescription(prDetails),
        start: optimalTime.start,
        end: optimalTime.end,
        timezone: optimalTime.timezone,
        attendees: validAttendees,
        location: 'Video Conference',
        createVideoCall: true,
        attachments: [
          {
            title: 'Pull Request',
            url: prDetails.urls.html,
            mimeType: 'text/html'
          }
        ]
      };

      const meeting = await this.calendar.createMeeting(
        meetingData,
        userContext.calendarToken,
        requestId
      );

      // Step 5: Send meeting details to Slack channel
      await this.slack.sendMessage(
        channel.id,
        this.formatMeetingNotification(meeting, prDetails),
        userContext.slackToken,
        requestId
      );

      // Step 6: Create a Notion page for the code review
      let notionPage = null;
      try {
        notionPage = await this.notion.createCodeReviewPage(
          prDetails,
          meeting,
          userContext.notionToken,
          requestId
        );
        
        // Send Notion page link to Slack
        if (notionPage) {
          await this.slack.sendMessage(
            channel.id,
            {
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `📝 *Notion page created for tracking this code review*\n<${notionPage.url}|${notionPage.title}>`
                  }
                }
              ],
              text: `Notion page created for code review: ${notionPage.url}`
            },
            userContext.slackToken,
            requestId
          );
        }
      } catch (notionError) {
        // Don't fail the entire workflow if Notion integration fails
        logger.error('Failed to create Notion page', {
          requestId,
          error: notionError.message
        });
      }

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
            title: meeting.title,
            time: meeting.start.toISOString(),
            duration: `${meetingDuration} minutes`,
            attendees: validAttendees.map(a => a.email),
            videoCall: meeting.videoCall?.joinUrl || 'Not available'
          },
          notion: notionPage ? {
            pageId: notionPage.id,
            url: notionPage.url
          } : null
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

  calculateMeetingDuration(prDetails, urgency = 'medium') {
    // Base duration based on PR complexity
    let duration = 30; // Default to 30 minutes
    
    // Adjust based on PR size and complexity
    const { changedFiles, additions, deletions } = prDetails.stats;
    
    if (changedFiles > 20 || additions + deletions > 1000) {
      duration = 60; // 1 hour for large PRs
    } else if (changedFiles > 5 || additions + deletions > 300) {
      duration = 45; // 45 minutes for medium PRs
    } else {
      duration = 30; // 30 minutes for small PRs
    }
    
    // Further adjust based on urgency
    switch(urgency) {
      case 'high':
        duration = Math.max(duration - 15, 15); // Reduce time but minimum 15 mins
        break;
      case 'low':
        duration = Math.min(duration + 15, 60); // Add time but maximum 60 mins
        break;
    }
    
    return duration;
  }

  getMeetingPreferences(urgency, prDetails) {
    const now = new Date();
    const preferences = {
      duration: this.calculateMeetingDuration(prDetails, urgency),
      workingHours: { start: 9, end: 17 },
      timezone: 'UTC',
      bufferMinutes: 15,
    };
    
    // Set timeMin and timeMax based on urgency
    switch(urgency) {
      case 'high':
        preferences.timeMin = now; // ASAP
        preferences.timeMax = new Date(Date.now() + 24 * 60 * 60 * 1000); // Within next 24 hours
        preferences.bufferMinutes = 5; // Smaller buffer for urgent meetings
        break;
      case 'medium':
        preferences.timeMin = new Date(Date.now() + 2 * 60 * 60 * 1000); // At least 2 hours from now
        preferences.timeMax = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // Within next 48 hours
        break;
      case 'low':
        preferences.timeMin = new Date(Date.now() + 24 * 60 * 60 * 1000); // At least 24 hours from now
        preferences.timeMax = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // Within next 5 days
        break;
    }
    
    return preferences;
  }
  
  generateMeetingDescription(prDetails) {
    const description = [];
    
    description.push(`Code Review for Pull Request #${prDetails.number}`);
    description.push(`Repository: ${prDetails.repository}`);
    description.push('');
    description.push(`Title: ${prDetails.title}`);
    description.push(`Author: ${prDetails.author.name || prDetails.author.login}`);
    description.push('');
    description.push('Changes:');
    description.push(`- ${prDetails.stats.changedFiles} files changed`);
    description.push(`- ${prDetails.stats.additions} additions`);
    description.push(`- ${prDetails.stats.deletions} deletions`);
    description.push('');
    description.push(`Pull Request URL: ${prDetails.urls.html}`);
    
    if (prDetails.description && prDetails.description.length > 0) {
      description.push('');
      description.push('Description:');
      description.push(prDetails.description.substring(0, 500) + (prDetails.description.length > 500 ? '...' : ''));
    }
    
    return description.join('\n');
  }
  
  formatMeetingNotification(meeting, prDetails) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📅 Code Review Meeting Scheduled',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*When:* <!date^${Math.floor(meeting.start.getTime() / 1000)}^{date_short_pretty} at {time}|${meeting.start.toLocaleString()}>`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:* ${Math.round((meeting.end - meeting.start) / (1000 * 60))} minutes`
          },
          {
            type: 'mrkdwn',
            text: `*Where:* ${meeting.location}`
          },
          {
            type: 'mrkdwn',
            text: `*PR:* <${prDetails.urls.html}|#${prDetails.number} ${prDetails.title}>`
          }
        ]
      }
    ];
    
    // Add video conference link if available
    if (meeting.videoCall && meeting.videoCall.joinUrl) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Video call:* <${meeting.videoCall.joinUrl}|Join meeting>`
        }
      });
    }
    
    // Add attendees
    if (meeting.attendees && meeting.attendees.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Attendees:* ${meeting.attendees.map(a => a.email).join(', ')}`
        }
      });
    }
    
    // Add divider and PR details
    blocks.push({ type: 'divider' });
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Pull Request #${prDetails.number}* - ${prDetails.title}\nCreated by: ${prDetails.author.name || prDetails.author.login}\nFiles: ${prDetails.stats.changedFiles} | Additions: ${prDetails.stats.additions} | Deletions: ${prDetails.stats.deletions}`
      }
    });
    
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View PR',
            emoji: true
          },
          url: prDetails.urls.html,
          style: 'primary'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Add to Calendar',
            emoji: true
          },
          url: meeting.htmlLink,
          style: 'primary'
        }
      ]
    });
    
    return {
      blocks,
      text: `Code Review for PR #${prDetails.number} scheduled for ${meeting.start.toLocaleString()}`
    };
  }

  async createProjectKickoff(args, userContext, requestId) {
    return {
      success: false,
      message: 'Project kickoff workflow not implemented yet',
      executionTime: '0ms'
    };
  }

  async handleIncidentResponse(args, userContext, requestId) {
    return {
      success: false,
      message: 'Incident response workflow not implemented yet',
      executionTime: '0ms'
    };
  }

  async cleanup() {
    logger.info('Cleaning up WorkflowOrchestrator...');
    
    if (this.github) {
      await this.github.cleanup();
    }
    
    if (this.slack) {
      await this.slack.cleanup();
    }
    
    if (this.calendar) {
      // Add any cleanup necessary for calendar
    }
    
    if (this.notion) {
      await this.notion.cleanup();
    }
    
    logger.info('WorkflowOrchestrator cleanup complete');
  }
}