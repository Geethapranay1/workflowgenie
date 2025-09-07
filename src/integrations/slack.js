// src/integrations/slack.js - Slack API Integration
import { WebClient } from '@slack/web-api';
import { logger, createPerformanceTimer } from '../utils/logger.js';

export class SlackConnector {
  constructor() {
    this.clients = new Map(); // Cache authenticated clients per user
    this.isInitialized = false;
    this.channelCache = new Map(); // Cache channel info to reduce API calls
  }

  async initialize() {
    logger.info('Initializing Slack connector...');
    this.isInitialized = true;
    logger.info('✅ Slack connector initialized');
  }

  /**
   * Get or create authenticated Slack client for user
   */
  getClient(userToken) {
    if (!userToken) {
      throw new Error('Slack token required for API access');
    }

    // Check if we have a cached client
    if (this.clients.has(userToken)) {
      return this.clients.get(userToken);
    }

    // Create new authenticated client
    const client = new WebClient(userToken, {
      logLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO'
    });

    // Cache the client
    this.clients.set(userToken, client);
    return client;
  }

  /**
   * Create a dedicated channel for code review or project discussion
   */
  async createReviewChannel(channelData, userToken, requestId) {
    const timer = createPerformanceTimer('slack_create_channel');
    
    try {
      const client = this.getClient(userToken);
      
      // Generate a clean channel name
      const channelName = this.generateChannelName(channelData.name, channelData.type || 'review');
      
      logger.debug('Creating Slack channel', {
        requestId,
        channelName,
        type: channelData.type || 'review'
      });

      // Create the channel
      const result = await client.conversations.create({
        name: channelName,
        is_private: channelData.private || false
      });

      const channel = result.channel;
      
      // Add members if specified
      if (channelData.members && channelData.members.length > 0) {
        await this.addMembersToChannel(channel.id, channelData.members, userToken, requestId);
      }

      // Set channel topic and description
      if (channelData.topic) {
        await client.conversations.setTopic({
          channel: channel.id,
          topic: channelData.topic.substring(0, 250) // Slack limit is 250 chars
        });
      }

      if (channelData.purpose) {
        await client.conversations.setPurpose({
          channel: channel.id,
          purpose: channelData.purpose.substring(0, 250)
        });
      }

      // Send initial context message if provided
      if (channelData.context) {
        await this.sendContextMessage(channel.id, channelData.context, userToken, requestId);
      }

      // Cache channel info
      this.cacheChannelInfo(channel.id, {
        name: channel.name,
        id: channel.id,
        created: new Date().toISOString()
      });

      logger.info('Slack channel created successfully', {
        requestId,
        channelId: channel.id,
        channelName: channel.name,
        memberCount: channelData.members?.length || 0,
        executionTime: timer.end()
      });

      return {
        id: channel.id,
        name: channel.name,
        url: `slack://channel?team=${result.channel.context_team_id}&id=${channel.id}`,
        webUrl: `https://app.slack.com/client/${result.channel.context_team_id}/${channel.id}`,
        members: channelData.members || [],
        private: channel.is_private,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      timer.end();
      
      if (error.data?.error === 'name_taken') {
        // Channel name exists, try with timestamp
        const timestampedName = `${channelData.name}-${Date.now().toString().slice(-4)}`;
        return await this.createReviewChannel({
          ...channelData,
          name: timestampedName
        }, userToken, requestId);
      }
      
      logger.error('Failed to create Slack channel', {
        requestId,
        error: error.message,
        slackError: error.data?.error
      });
      
      throw new Error(`Failed to create Slack channel: ${error.data?.error || error.message}`);
    }
  }

  /**
   * Send a rich, formatted message about a pull request or project update
   */
  async sendPullRequestMessage(channelId, prData, userToken, requestId) {
    const timer = createPerformanceTimer('slack_send_pr_message');
    
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Sending PR message to Slack', {
        requestId,
        channelId,
        prNumber: prData.number
      });

      // Create rich message blocks
      const blocks = this.buildPullRequestBlocks(prData);
      
      const result = await client.chat.postMessage({
        channel: channelId,
        text: `Pull Request #${prData.number}: ${prData.title}`, // Fallback text
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false
      });

      logger.info('PR message sent to Slack', {
        requestId,
        channelId,
        messageTs: result.ts,
        prNumber: prData.number,
        executionTime: timer.end()
      });

      return {
        messageId: result.ts,
        channel: channelId,
        permalink: await this.getMessagePermalink(channelId, result.ts, userToken)
      };

    } catch (error) {
      timer.end();
      
      logger.error('Failed to send PR message', {
        requestId,
        channelId,
        error: error.message
      });
      
      throw new Error(`Failed to send message: ${error.data?.error || error.message}`);
    }
  }

  /**
   * Send a notification about scheduled meetings or events
   */
  async sendMeetingNotification(channelId, meetingData, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Sending meeting notification', {
        requestId,
        channelId,
        meetingTitle: meetingData.title
      });

      const blocks = this.buildMeetingBlocks(meetingData);
      
      const result = await client.chat.postMessage({
        channel: channelId,
        text: `📅 Meeting Scheduled: ${meetingData.title}`,
        blocks: blocks
      });

      // Add calendar reminder reactions
      await client.reactions.add({
        channel: channelId,
        timestamp: result.ts,
        name: 'calendar'
      });

      logger.info('Meeting notification sent', {
        requestId,
        channelId,
        messageTs: result.ts
      });

      return {
        messageId: result.ts,
        channel: channelId
      };

    } catch (error) {
      logger.error('Failed to send meeting notification', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send project status update or summary
   */
  async sendProjectUpdate(channelId, updateData, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      const blocks = this.buildProjectUpdateBlocks(updateData);
      
      const result = await client.chat.postMessage({
        channel: channelId,
        text: `📊 Project Update: ${updateData.projectName}`,
        blocks: blocks
      });

      logger.info('Project update sent', {
        requestId,
        channelId,
        project: updateData.projectName
      });

      return {
        messageId: result.ts,
        channel: channelId
      };

    } catch (error) {
      logger.error('Failed to send project update', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add members to a channel
   */
  async addMembersToChannel(channelId, members, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      // Convert email addresses to Slack user IDs if needed
      const userIds = await this.resolveUserIds(members, userToken);
      
      if (userIds.length === 0) {
        logger.warn('No valid users found to add to channel', {
          requestId,
          channelId,
          members
        });
        return;
      }

      // Add users to channel (Slack allows up to 30 users per call)
      const batches = this.chunkArray(userIds, 30);
      
      for (const batch of batches) {
        await client.conversations.invite({
          channel: channelId,
          users: batch.join(',')
        });
      }

      logger.info('Members added to channel', {
        requestId,
        channelId,
        memberCount: userIds.length
      });

      return userIds;

    } catch (error) {
      logger.error('Failed to add members to channel', {
        requestId,
        channelId,
        error: error.message
      });
      // Don't throw - channel creation can succeed even if member addition fails
      return [];
    }
  }

  /**
   * Resolve user emails/usernames to Slack user IDs
   */
  async resolveUserIds(members, userToken) {
    const client = this.getClient(userToken);
    const userIds = [];

    for (const member of members) {
      try {
        // If it's already a user ID (starts with U), use it
        if (typeof member === 'string' && member.startsWith('U')) {
          userIds.push(member);
          continue;
        }

        // Try to find user by email
        const email = typeof member === 'object' ? member.email : member;
        if (email && email.includes('@')) {
          const result = await client.users.lookupByEmail({ email });
          if (result.user) {
            userIds.push(result.user.id);
          }
        }
      } catch (error) {
        logger.debug('Could not resolve user', { member, error: error.message });
        // Continue with other members
      }
    }

    return userIds;
  }

  /**
   * Get current workspace information
   */
  async getWorkspaceInfo(userToken) {
    try {
      const client = this.getClient(userToken);
      
      const teamInfo = await client.team.info();
      const userInfo = await client.auth.test();
      
      return {
        team: {
          id: teamInfo.team.id,
          name: teamInfo.team.name,
          domain: teamInfo.team.domain,
          url: `https://${teamInfo.team.domain}.slack.com`
        },
        user: {
          id: userInfo.user_id,
          name: userInfo.user
        },
        botId: userInfo.bot_id
      };

    } catch (error) {
      logger.error('Failed to get workspace info', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate clean channel name from input
   */
  generateChannelName(input, type = 'general') {
    // Clean and format channel name according to Slack rules
    let name = input
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 18); // Slack channel names max 21 chars, leave room for suffix

    // Add type suffix
    if (type && !name.includes(type)) {
      name = `${name}-${type}`;
    }

    // Ensure minimum length
    if (name.length < 3) {
      name = `${type}-${Date.now().toString().slice(-4)}`;
    }

    return name.substring(0, 21); // Slack's hard limit
  }

  /**
   * Build rich message blocks for pull request
   */
  buildPullRequestBlocks(prData) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🔍 Code Review: PR #${prData.number}`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${prData.title}*\n${prData.body ? prData.body.substring(0, 200) + (prData.body.length > 200 ? '...' : '') : 'No description provided'}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View PR',
            emoji: true
          },
          url: prData.urls.html,
          action_id: 'view_pr'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Author:*\n${prData.author.name} (@${prData.author.login})`
          },
          {
            type: 'mrkdwn',
            text: `*Branch:*\n${prData.branch.source} → ${prData.branch.target}`
          },
          {
            type: 'mrkdwn',
            text: `*Changes:*\n+${prData.stats.additions} -${prData.stats.deletions} (${prData.stats.changedFiles} files)`
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${prData.state === 'open' ? '🟢 Open' : '🔴 ' + prData.state}`
          }
        ]
      }
    ];

    // Add reviewers section if there are any
    if (prData.requestedReviewers && prData.requestedReviewers.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Requested Reviewers:*\n${prData.requestedReviewers.map(r => `• ${r.name} (@${r.login})`).join('\n')}`
        }
      });
    }

    // Add divider
    blocks.push({ type: 'divider' });

    return blocks;
  }

  /**
   * Build rich message blocks for meeting notification
   */
  buildMeetingBlocks(meetingData) {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📅 Meeting Scheduled`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${meetingData.title}*\n${meetingData.description || ''}`
        },
        accessory: meetingData.link ? {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Join Meeting',
            emoji: true
          },
          url: meetingData.link,
          action_id: 'join_meeting'
        } : undefined
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*When:*\n${meetingData.time}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${meetingData.duration || '30 minutes'}`
          },
          {
            type: 'mrkdwn',
            text: `*Attendees:*\n${meetingData.attendees ? meetingData.attendees.join(', ') : 'TBD'}`
          },
          {
            type: 'mrkdwn',
            text: `*Location:*\n${meetingData.location || 'Video call'}`
          }
        ]
      },
      { type: 'divider' }
    ];
  }

  /**
   * Build blocks for project updates
   */
  buildProjectUpdateBlocks(updateData) {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 ${updateData.projectName} Update`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: updateData.summary || 'Project status update'
        }
      },
      {
        type: 'section',
        fields: updateData.fields || []
      },
      { type: 'divider' }
    ];
  }

  /**
   * Send initial context message to channel
   */
  async sendContextMessage(channelId, context, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      let message = '👋 Welcome to this channel!\n\n';
      
      if (context.purpose) {
        message += `**Purpose:** ${context.purpose}\n`;
      }
      
      if (context.prNumber && context.repository) {
        message += `**Related PR:** #${context.prNumber} in ${context.repository}\n`;
      }
      
      if (context.links && context.links.length > 0) {
        message += `**Useful Links:**\n`;
        context.links.forEach(link => {
          message += `• <${link.url}|${link.title}>\n`;
        });
      }

      await client.chat.postMessage({
        channel: channelId,
        text: message,
        mrkdwn: true
      });

    } catch (error) {
      logger.error('Failed to send context message', {
        requestId,
        error: error.message
      });
      // Don't throw - this is not critical
    }
  }

  /**
   * Get message permalink
   */
  async getMessagePermalink(channelId, messageTs, userToken) {
    try {
      const client = this.getClient(userToken);
      const result = await client.chat.getPermalink({
        channel: channelId,
        message_ts: messageTs
      });
      return result.permalink;
    } catch (error) {
      logger.debug('Could not get message permalink', { error: error.message });
      return null;
    }
  }

  /**
   * Cache channel information
   */
  cacheChannelInfo(channelId, channelInfo) {
    this.channelCache.set(channelId, {
      ...channelInfo,
      cachedAt: Date.now()
    });
  }

  /**
   * Utility function to chunk array
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Send a generic message to a Slack channel
   */
  async sendMessage(channelId, messageData, userToken, requestId) {
    const timer = createPerformanceTimer('slack_send_message');
    
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Sending message to Slack', {
        requestId,
        channelId
      });

      const messageOptions = {
        channel: channelId,
        text: messageData.text || "New message" // Fallback text
      };
      
      // Add blocks if provided
      if (messageData.blocks) {
        messageOptions.blocks = messageData.blocks;
      }
      
      // Add attachments if provided
      if (messageData.attachments) {
        messageOptions.attachments = messageData.attachments;
      }
      
      // Set other options
      if (messageData.thread_ts) {
        messageOptions.thread_ts = messageData.thread_ts;
      }
      
      if (messageData.mrkdwn !== undefined) {
        messageOptions.mrkdwn = messageData.mrkdwn;
      }
      
      if (messageData.unfurl_links !== undefined) {
        messageOptions.unfurl_links = messageData.unfurl_links;
      }

      const result = await client.chat.postMessage(messageOptions);

      logger.info('Message sent to Slack', {
        requestId,
        channelId,
        messageTs: result.ts,
        executionTime: timer.end()
      });

      return {
        messageId: result.ts,
        channel: channelId,
        permalink: await this.getMessagePermalink(channelId, result.ts, userToken)
      };

    } catch (error) {
      timer.end();
      
      logger.error('Failed to send message', {
        requestId,
        channelId,
        error: error.message
      });
      
      throw new Error(`Failed to send message: ${error.data?.error || error.message}`);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up Slack connector...');
    this.clients.clear();
    this.channelCache.clear();
    logger.info('✅ Slack cleanup complete');
  }
}