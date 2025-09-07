export const defaultWorkflowConfig = {
  codeReview: {
    meeting: {
      defaultDuration: 30, // minutes
      minDuration: 15,
      maxDuration: 120,
      bufferTime: 15, // minutes before/after
      workingHours: {
        start: 9,
        end: 17
      },
      maxDaysAhead: 5,
      reminderTimes: [60, 15], // minutes before meeting
      autoRecording: true
    },
    slack: {
      channelPrivate: false,
      notifyOnChanges: true,
      reminderTemplate: '🔔 Reminder: Code review meeting for PR #{pr_number} starts in {time_left}',
      summaryTemplate: '📝 Meeting Summary:\n{summary}\n\nAction Items:\n{action_items}'
    },
    notion: {
      autoUpdatePR: true, // Update PR description with meeting notes link
      templateFields: [
        'Context',
        'Technical Implementation',
        'Testing Strategy',
        'Action Items',
        'Follow-ups'
      ],
      categorizeByTeam: true
    },
    followUp: {
      checkInterval: 24, // hours
      maxFollowUps: 3,
      autoCloseStale: 168, // 7 days in hours
      requireApproval: true
    }
  }
};
