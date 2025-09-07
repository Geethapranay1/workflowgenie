import { logger } from '../utils/logger.js';
import { defaultWorkflowConfig } from '../config/workflow-config.js';

export class WorkflowAutomation {
  constructor(orchestrator, config = {}) {
    this.orchestrator = orchestrator;
    this.config = {
      ...defaultWorkflowConfig,
      ...config
    };
    this.scheduledReminders = new Map();
    this.followUpTasks = new Map();
  }

  async scheduleReminders(meetingId, meetingDetails, userContext, requestId) {
    const { reminderTimes } = this.config.codeReview.meeting;
    const startTime = new Date(meetingDetails.startTime);

    for (const minutes of reminderTimes) {
      const reminderTime = new Date(startTime.getTime() - minutes * 60 * 1000);
      
      if (reminderTime > new Date()) {
        const reminderId = `reminder-${meetingId}-${minutes}`;
        const timer = setTimeout(async () => {
          await this.sendReminder(meetingDetails, minutes, userContext, requestId);
        }, reminderTime.getTime() - Date.now());

        this.scheduledReminders.set(reminderId, timer);

        logger.info(`Scheduled reminder for meeting`, {
          requestId,
          meetingId,
          minutesBefore: minutes,
          reminderTime: reminderTime.toISOString()
        });
      }
    }
  }

  async sendReminder(meetingDetails, minutesBefore, userContext, requestId) {
    try {
      const message = this.config.codeReview.slack.reminderTemplate
        .replace('{pr_number}', meetingDetails.prNumber)
        .replace('{time_left}', `${minutesBefore} minutes`);

      await this.orchestrator.slack.sendMessage(
        meetingDetails.channelId,
        {
          text: message,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Quick Links:*\n• <${meetingDetails.meetingUrl}|Join Meeting>\n• <${meetingDetails.prUrl}|Pull Request>\n• <${meetingDetails.notesUrl}|Meeting Notes>`
              }
            }
          ]
        },
        userContext.slackToken,
        requestId
      );

      logger.info('Sent meeting reminder', {
        requestId,
        channelId: meetingDetails.channelId,
        minutesBefore
      });
    } catch (error) {
      logger.error('Failed to send reminder', {
        requestId,
        error: error.message
      });
    }
  }

  async scheduleFollowUp(reviewDetails, userContext, requestId) {
    const followUpId = `followup-${reviewDetails.prNumber}-${Date.now()}`;
    const { checkInterval, maxFollowUps } = this.config.codeReview.followUp;

    let followUpCount = 0;
    const checkStatus = async () => {
      try {
        // Get current PR status
        const prDetails = await this.orchestrator.github.getPullRequest(
          reviewDetails.repository,
          reviewDetails.prNumber,
          userContext.githubToken,
          requestId
        );

        // Get action items from Notion
        const notionNotes = await this.orchestrator.notion.getDocument(
          reviewDetails.notesId,
          userContext.notionToken,
          requestId
        );

        const pendingItems = this.extractPendingItems(notionNotes.content);

        if (pendingItems.length > 0) {
          followUpCount++;
          if (followUpCount <= maxFollowUps) {
            // Send follow-up message
            await this.sendFollowUpMessage(
              reviewDetails,
              pendingItems,
              prDetails,
              userContext,
              requestId
            );

            // Schedule next check
            setTimeout(checkStatus, checkInterval * 60 * 60 * 1000);
          } else {
            // Escalate if max follow-ups reached
            await this.escalateStaleReview(reviewDetails, userContext, requestId);
          }
        } else if (!prDetails.merged) {
          // All items completed but PR not merged
          await this.notifyReadyForMerge(reviewDetails, userContext, requestId);
        }

        // Check for stale PR
        const staleThreshold = this.config.codeReview.followUp.autoCloseStale * 60 * 60 * 1000;
        if (Date.now() - new Date(prDetails.updatedAt).getTime() > staleThreshold) {
          await this.handleStalePR(reviewDetails, prDetails, userContext, requestId);
        }

      } catch (error) {
        logger.error('Follow-up check failed', {
          requestId,
          error: error.message,
          reviewDetails
        });
      }
    };

    // Start the first check after the meeting end time
    const meetingEnd = new Date(reviewDetails.meetingEndTime);
    const delay = Math.max(meetingEnd.getTime() - Date.now(), 0);
    
    const timer = setTimeout(checkStatus, delay);
    this.followUpTasks.set(followUpId, timer);

    logger.info('Scheduled follow-up checks', {
      requestId,
      followUpId,
      firstCheckAt: new Date(Date.now() + delay).toISOString()
    });

    return followUpId;
  }

  async sendFollowUpMessage(reviewDetails, pendingItems, prDetails, userContext, requestId) {
    const message = {
      text: `📋 *Code Review Follow-up: PR #${reviewDetails.prNumber}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📋 Code Review Follow-up: PR #${reviewDetails.prNumber}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Pending Action Items:*\n' + pendingItems.map(item => `• ${item}`).join('\n')
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Current PR Status:*\n' +
                  `• Comments: ${prDetails.comments}\n` +
                  `• Approvals: ${prDetails.approvals}\n` +
                  `• Last updated: ${new Date(prDetails.updatedAt).toLocaleDateString()}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Links:*\n' +
                  `• <${reviewDetails.prUrl}|Pull Request>\n` +
                  `• <${reviewDetails.notesUrl}|Meeting Notes>`
          }
        }
      ]
    };

    await this.orchestrator.slack.sendMessage(
      reviewDetails.channelId,
      message,
      userContext.slackToken,
      requestId
    );
  }

  extractPendingItems(notesContent) {
    const pendingItems = [];
    const lines = notesContent.split('\n');
    
    for (const line of lines) {
      if (line.includes('- [ ]')) { // Unchecked checkbox in markdown
        pendingItems.push(line.replace('- [ ]', '').trim());
      }
    }

    return pendingItems;
  }

  async escalateStaleReview(reviewDetails, userContext, requestId) {
    // Notify team lead or manager
    const message = {
      text: `🚨 *Stale Review Alert: PR #${reviewDetails.prNumber}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 Stale Review Alert: PR #${reviewDetails.prNumber}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `This PR has had pending action items for an extended period. Please review and determine next steps.`
          }
        }
      ]
    };

    await this.orchestrator.slack.sendMessage(
      reviewDetails.channelId,
      message,
      userContext.slackToken,
      requestId
    );
  }

  async notifyReadyForMerge(reviewDetails, userContext, requestId) {
    const message = {
      text: `✅ *PR Ready for Merge: #${reviewDetails.prNumber}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `✅ PR Ready for Merge: #${reviewDetails.prNumber}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `All action items have been completed! The PR is ready for final review and merge.`
          }
        }
      ]
    };

    await this.orchestrator.slack.sendMessage(
      reviewDetails.channelId,
      message,
      userContext.slackToken,
      requestId
    );
  }

  async handleStalePR(reviewDetails, prDetails, userContext, requestId) {
    // Create a summary in Notion
    const staleSummary = await this.orchestrator.notion.createDocument(
      process.env.NOTION_PROJECTS_DB_ID,
      {
        title: `Stale PR Summary: #${reviewDetails.prNumber}`,
        type: 'PR Summary',
        content: `# Stale PR Summary\n\n` +
                `## Pull Request Details\n` +
                `- PR: #${reviewDetails.prNumber}\n` +
                `- Title: ${prDetails.title}\n` +
                `- Author: ${prDetails.author.name}\n` +
                `- Created: ${new Date(prDetails.createdAt).toLocaleDateString()}\n` +
                `- Last Updated: ${new Date(prDetails.updatedAt).toLocaleDateString()}\n\n` +
                `## Timeline\n` +
                `- Review Meeting: ${new Date(reviewDetails.meetingStartTime).toLocaleString()}\n` +
                `- Follow-up Attempts: ${reviewDetails.followUpCount}\n\n` +
                `## Current Status\n` +
                `- Comments: ${prDetails.comments}\n` +
                `- Approvals: ${prDetails.approvals}\n` +
                `- Changes Requested: ${prDetails.changesRequested}\n\n` +
                `## Next Steps\n` +
                `1. Review the PR status and determine if it should be:\n` +
                `   - Closed due to inactivity\n` +
                `   - Reassigned to another developer\n` +
                `   - Prioritized for completion\n` +
                `2. Update the project tracking with the decision\n` +
                `3. Communicate the decision to the team\n`,
        owners: [...reviewDetails.reviewers, reviewDetails.author]
      },
      userContext.notionToken,
      requestId
    );

    // Notify about stale status
    const message = {
      text: `⏰ *Stale PR Detected: #${reviewDetails.prNumber}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `⏰ Stale PR Detected: #${reviewDetails.prNumber}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `This PR has been inactive for ${this.config.codeReview.followUp.autoCloseStale / 24} days.`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Action Required:*\nPlease review the summary and decide on next steps:\n` +
                  `• <${staleSummary.url}|View Stale PR Summary>\n` +
                  `• <${reviewDetails.prUrl}|View Pull Request>`
          }
        }
      ]
    };

    await this.orchestrator.slack.sendMessage(
      reviewDetails.channelId,
      message,
      userContext.slackToken,
      requestId
    );
  }

  cleanup() {
    // Clear all scheduled reminders
    for (const timer of this.scheduledReminders.values()) {
      clearTimeout(timer);
    }
    this.scheduledReminders.clear();

    // Clear all follow-up tasks
    for (const timer of this.followUpTasks.values()) {
      clearTimeout(timer);
    }
    this.followUpTasks.clear();
  }
}
