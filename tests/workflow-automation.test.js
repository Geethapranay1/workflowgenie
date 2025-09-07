import { jest } from '@jest/globals';
import { WorkflowOrchestrator } from '../src/services/orchestrator.js';
import { defaultWorkflowConfig } from '../src/config/workflow-config.js';

describe('Code Review Workflow', () => {
  let orchestrator;
  const mockUserContext = {
    githubToken: 'mock-github-token',
    slackToken: 'mock-slack-token',
    notionToken: 'mock-notion-token',
    calendarToken: 'mock-calendar-token'
  };
  const mockRequestId = 'test-request-123';

  beforeEach(() => {
    orchestrator = new WorkflowOrchestrator({
      codeReview: {
        ...defaultWorkflowConfig.codeReview,
        meeting: {
          ...defaultWorkflowConfig.codeReview.meeting,
          defaultDuration: 15, // Shorter duration for tests
          reminderTimes: [5] // Single reminder for tests
        }
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('schedules code review with all integrations', async () => {
    const mockPRDetails = {
      number: 123,
      title: 'Test PR',
      author: { name: 'author', email: 'author@test.com' },
      requestedReviewers: [
        { name: 'reviewer1', email: 'reviewer1@test.com' }
      ],
      stats: { changedFiles: 2, additions: 10, deletions: 5 },
      urls: { html: 'http://pr-url' }
    };

    const mockIssueDetails = {
      number: 456,
      html_url: 'http://issue-url'
    };

    const mockChannel = {
      id: 'channel-123',
      name: 'pr-123-test',
      webUrl: 'http://slack-url'
    };

    const mockMeeting = {
      id: 'meeting-123',
      hangoutLink: 'http://meet-url',
      start: { dateTime: '2025-09-07T10:00:00Z' }
    };

    const mockNotionPage = {
      id: 'page-123',
      url: 'http://notion-url'
    };

    // Mock integration methods
    orchestrator.github.getPullRequest = jest.fn().mockResolvedValue(mockPRDetails);
    orchestrator.github.getIssue = jest.fn().mockResolvedValue(mockIssueDetails);
    orchestrator.slack.createReviewChannel = jest.fn().mockResolvedValue(mockChannel);
    orchestrator.calendar.findOptimalTime = jest.fn().mockResolvedValue({
      start: new Date('2025-09-07T10:00:00Z'),
      end: new Date('2025-09-07T10:30:00Z'),
      formatted: '10:00 AM - 10:30 AM'
    });
    orchestrator.calendar.createMeeting = jest.fn().mockResolvedValue(mockMeeting);
    orchestrator.notion.createDocument = jest.fn().mockResolvedValue(mockNotionPage);
    orchestrator.slack.sendMessage = jest.fn().mockResolvedValue({ ts: '123.456' });

    const result = await orchestrator.scheduleCodeReview({
      repository: 'test/repo',
      pr_number: '123',
      issue_number: '456'
    }, mockUserContext, mockRequestId);

    expect(result.success).toBe(true);
    expect(result.details).toMatchObject({
      pr_number: '123',
      issue_number: '456',
      slack_channel: '#pr-123-test',
      notion: { url: 'http://notion-url' }
    });

    // Verify all integrations were called
    expect(orchestrator.github.getPullRequest).toHaveBeenCalled();
    expect(orchestrator.github.getIssue).toHaveBeenCalled();
    expect(orchestrator.slack.createReviewChannel).toHaveBeenCalled();
    expect(orchestrator.calendar.createMeeting).toHaveBeenCalled();
    expect(orchestrator.notion.createDocument).toHaveBeenCalled();
    expect(orchestrator.slack.sendMessage).toHaveBeenCalled();
  });

  test('handles missing attendee emails gracefully', async () => {
    const mockPRDetails = {
      number: 123,
      title: 'Test PR',
      author: { name: 'author' }, // Missing email
      requestedReviewers: [
        { name: 'reviewer1' } // Missing email
      ],
      stats: { changedFiles: 2, additions: 10, deletions: 5 },
      urls: { html: 'http://pr-url' }
    };

    orchestrator.github.getPullRequest = jest.fn().mockResolvedValue(mockPRDetails);
    // ... other mocks

    const result = await orchestrator.scheduleCodeReview({
      repository: 'test/repo',
      pr_number: '123',
      issue_number: '456',
      additional_attendees: ['manager@test.com'] // Ensure at least one valid email
    }, mockUserContext, mockRequestId);

    expect(result.success).toBe(true);
    // Verify meeting was scheduled with available attendees
    expect(orchestrator.calendar.createMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: ['manager@test.com']
      }),
      expect.anything(),
      expect.anything()
    );
  });

  test('sends reminders before meeting', async () => {
    jest.useFakeTimers();

    const mockMeetingDetails = {
      startTime: new Date(Date.now() + 60000).toISOString(), // Meeting in 1 minute
      channelId: 'channel-123',
      prNumber: '123',
      meetingUrl: 'http://meet-url',
      prUrl: 'http://pr-url',
      notesUrl: 'http://notion-url'
    };

    await orchestrator.automation.scheduleReminders(
      'meeting-123',
      mockMeetingDetails,
      mockUserContext,
      mockRequestId
    );

    // Fast forward 55 seconds (5 seconds before meeting)
    jest.advanceTimersByTime(55000);

    // Verify reminder was sent
    expect(orchestrator.slack.sendMessage).toHaveBeenCalledWith(
      'channel-123',
      expect.objectContaining({
        text: expect.stringContaining('5 minutes')
      }),
      mockUserContext.slackToken,
      mockRequestId
    );

    jest.useRealTimers();
  });

  test('handles follow-ups after meeting', async () => {
    const mockReviewDetails = {
      prNumber: '123',
      repository: 'test/repo',
      channelId: 'channel-123',
      notesId: 'notes-123',
      meetingEndTime: new Date().toISOString(),
      reviewers: ['reviewer1@test.com'],
      author: 'author@test.com'
    };

    // Mock pending action items in Notion
    orchestrator.notion.getDocument = jest.fn().mockResolvedValue({
      content: '- [ ] Update tests\n- [ ] Add documentation'
    });

    // Mock PR not being merged yet
    orchestrator.github.getPullRequest = jest.fn().mockResolvedValue({
      merged: false,
      comments: 2,
      approvals: 1,
      updatedAt: new Date().toISOString()
    });

    const followUpId = await orchestrator.automation.scheduleFollowUp(
      mockReviewDetails,
      mockUserContext,
      mockRequestId
    );

    expect(followUpId).toBeDefined();

    // Verify follow-up check was scheduled
    expect(orchestrator.automation.followUpTasks.size).toBe(1);

    // Test stale PR handling
    const oldPRDate = new Date();
    oldPRDate.setDate(oldPRDate.getDate() - 8); // 8 days old

    orchestrator.github.getPullRequest = jest.fn().mockResolvedValue({
      merged: false,
      comments: 2,
      approvals: 1,
      updatedAt: oldPRDate.toISOString()
    });

    await orchestrator.automation.handleStalePR(
      mockReviewDetails,
      {
        title: 'Test PR',
        author: { name: 'author' },
        createdAt: oldPRDate.toISOString(),
        updatedAt: oldPRDate.toISOString(),
        comments: 2,
        approvals: 1,
        changesRequested: 0
      },
      mockUserContext,
      mockRequestId
    );

    // Verify stale PR handling
    expect(orchestrator.notion.createDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'PR Summary',
        title: expect.stringContaining('Stale PR Summary: #123')
      }),
      expect.anything(),
      expect.anything()
    );
  });
});
