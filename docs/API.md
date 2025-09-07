# WorkflowGenie MCP Server API Documentation

This document describes the MCP tools available through the WorkflowGenie MCP server and how to use them.

## MCP Tools Overview

WorkflowGenie exposes functionality through the Model Context Protocol (MCP), allowing AI agents to interact with workplace tools seamlessly and securely.

## Tool: `schedule_code_review`

Schedules a comprehensive code review process by coordinating across GitHub, Slack, Google Calendar, and Notion.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "pr_number": {
      "type": "string",
      "description": "Pull request number (e.g., '123')"
    },
    "repository": {
      "type": "string", 
      "description": "Repository name in format 'owner/repo'"
    },
    "urgency": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "default": "medium"
    }
  },
  "required": ["pr_number", "repository"]
}
```

### Output Schema

```json
{
  "success": true|false,
  "message": "Status message",
  "executionTime": "Time in milliseconds",
  "details": {
    "repository": "Repository name",
    "pr_number": "PR number",
    "slack_channel": "Slack channel name",
    "github_pr": "GitHub PR URL",
    "meeting": {
      "title": "Meeting title",
      "time": "ISO timestamp",
      "duration": "Duration string",
      "attendees": ["Array of emails"],
      "videoCall": "Video call URL if available"
    },
    "notion": {
      "pageId": "Notion page ID",
      "url": "Notion page URL"
    }
  }
}
```

### Example Usage

```json
// Example request
{
  "pr_number": "456",
  "repository": "facebook/react",
  "urgency": "high"
}

// Example response
{
  "success": true,
  "message": "Code review scheduled for PR #456",
  "executionTime": "2381ms",
  "details": {
    "repository": "facebook/react",
    "pr_number": "456",
    "slack_channel": "#pr-456-update-hooks-api",
    "github_pr": "https://github.com/facebook/react/pull/456",
    "meeting": {
      "title": "Code Review: PR #456 - Update Hooks API",
      "time": "2025-09-08T15:30:00Z",
      "duration": "30 minutes",
      "attendees": ["dev1@example.com", "dev2@example.com", "manager@example.com"],
      "videoCall": "https://meet.google.com/abc-defg-hij"
    },
    "notion": {
      "pageId": "8a7b6c5d-4e3f-2g1h-0i9j-8k7l6m5n4o3p",
      "url": "https://notion.so/workspace/8a7b6c5d4e3f2g1h0i9j8k7l6m5n4o3p"
    }
  }
}
```

### Required Permissions

The WorkflowGenie MCP Server requires the following permissions for each integration:

#### GitHub
- `repo`: Full access to repositories
- `user:email`: Read email addresses

#### Slack
- `channels:read`: View basic information about public channels
- `channels:write`: Manage public channels
- `chat:write`: Send messages
- `users:read`: View users and their information
- `users:read.email`: View email addresses of users

#### Google Calendar
- `calendar.events`: Read and write calendar events
- `calendar.settings.readonly`: Read calendar settings

#### Notion
- `page:write`: Create and update pages
- `database:read`: Read database schema

## Tool: `create_project_kickoff` (Coming Soon)

Automates the creation of project kickoff resources across multiple platforms.

## Tool: `handle_incident_response` (Coming Soon)

Coordinates incident response activities and communication.

## Authentication

All MCP tool requests must include a valid user token that provides access to the required services. Authentication is handled through the Descope service and Cequence AI Gateway.

## Rate Limits

To ensure fair usage and system stability, the following rate limits apply:

- **Free tier**: 10 requests per minute
- **Pro tier**: 100 requests per minute
- **Enterprise tier**: Custom limits based on needs

## Error Handling

Errors are returned with appropriate HTTP status codes and descriptive messages:

```json
{
  "success": false,
  "message": "Error message explaining what went wrong",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

Common error codes:
- `AUTHENTICATION_ERROR`: Invalid or missing authentication
- `PERMISSION_ERROR`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid input parameters
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTEGRATION_ERROR`: Error with third-party service
- `INTERNAL_ERROR`: Internal server error
