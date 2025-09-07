# WorkflowGenie MCP Server - Hackathon Demo Script

## Overview
This demonstration shows how WorkflowGenie orchestrates a complete code review workflow across GitHub, Slack, Google Calendar, and Notion.

## Demo Steps

### 1. Initial Setup
- Show the WorkflowGenie MCP server running
- Explain that we've integrated with GitHub, Slack, Google Calendar, and Notion

### 2. The Scenario
- We have a Pull Request #27000 on facebook/react
- We need to schedule a code review with the appropriate stakeholders
- Without WorkflowGenie, this would require manual coordination across multiple tools

### 3. Using WorkflowGenie
- Show the AI agent interface (or CLI for this demo)
- Use the 'schedule_code_review' tool with repository: 'facebook/react', pr_number: '27000'
- Explain that in a real scenario, the AI agent would handle this based on natural language requests

### 4. Behind the Scenes (what WorkflowGenie does)
- Fetches PR details from GitHub (author, reviewers, changes)
- Creates a dedicated Slack channel for code review discussions
- Checks calendars to find an optimal meeting time for all participants
- Schedules a calendar event with video conferencing
- Creates a Notion document with code review context and checklist
- Updates all systems with cross-links for seamless navigation

### 5. The Results
```
✅ Code review for PR #27000 has been scheduled!

📋 **PR Details:**
- Repository: facebook/react
- PR #27000: "Fix login bug with OAuth providers"
- Author: @developer123
- Modified Files: 5 files changed, 120 additions, 45 deletions

🗓️ **Calendar Meeting:**
- Scheduled for: Monday, September 8 at 10:00 AM GMT+5:30
- Duration: 30 minutes
- Attendees: @developer123, @reviewer1, @techLead
- Video Call Link: https://meet.google.com/abc-defg-hij

💬 **Slack Channel:**
- Created channel: #pr-27000-review
- Invited team members and posted meeting details
- Channel link: https://slack.com/channels/pr-27000-review

All set! The calendar invites have been sent to all reviewers.
```

### 6. Benefits
- Saved 15-30 minutes of manual coordination work
- Ensured consistent process across all code reviews
- All context available in each tool (no switching required)
- Secure, permissioned access to each system