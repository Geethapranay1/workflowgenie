# 🧞‍♂️ WorkflowGenie MCP Server

## 🚀 Project Overview

**WorkflowGenie** is an intelligent MCP (Model Context Protocol) server that orchestrates complex workflows across multiple workplace applications with enterprise-grade security. It seamlessly connects AI agents with workplace tools including GitHub, Slack, Google Calendar, and Notion to automate complex, multi-step workflows.

**Team Name:** CodeCraft Solutions  
**Team Members:** 
- Geetha Pranay P
- Guru Prasath P
- Vigneshwar S

## 🏆 Hackathon Challenge Addressed

**Theme 2: Model Context Protocol (MCP) Innovation Challenge**

WorkflowGenie addresses the MCP Innovation Challenge by creating a powerful workplace orchestration platform that leverages AI agents to automate complex cross-platform workflows. Our implementation utilizes the Cequence AI Gateway for secure MCP communication and exposes a production-ready MCP server for intelligent agents.

### How We've Used Cequence AI Gateway

Our MCP server integrates with Cequence AI Gateway to provide:

1. **Security**: Enterprise-grade security features to protect API endpoints
2. **Observability**: Detailed logging and monitoring of AI agent activity
3. **Rate Limiting**: Prevention of abuse through intelligent rate limiting
4. **Authentication**: Secure integration with Descope for token validation
5. **Audit Trail**: Comprehensive logging of all AI-initiated actions

The integration allows for secure proxy access from AI agents (like Claude) to our backend services while maintaining proper authentication, authorization, and audit trails.

## 🔧 What We Built

WorkflowGenie is an MCP server that provides workplace automation tools to AI agents. Our primary focus is on a complete code review orchestration workflow that spans multiple platforms:

1. **Code Review Scheduling**: End-to-end integration across GitHub, Slack, Google Calendar, and Notion
   - Fetches PR details and involved developers from GitHub
   - Creates dedicated Slack channels for review discussions
   - Finds optimal meeting time based on reviewers' calendar availability
   - Schedules calendar events with video conferencing
   - Creates Notion pages with code review checklists and context
   - Links all systems together for seamless navigation

2. **Security and Enterprise Focus**:
   - Built on Cequence AI Gateway for enterprise-grade API security
   - Implemented with Descope Authentication for secure OAuth flows
   - Designed with proper permission scoping and audit logging

## 🛠️ Tech Stack

- **MCP Implementation**: MCP SDK with Cequence AI Gateway integration
- **Backend**: Node.js with Express
- **Integrations**:
  - GitHub: @octokit/rest for GitHub API interactions
  - Slack: @slack/web-api for Slack workspace integration
  - Google Calendar: googleapis for scheduling and calendar management
  - Notion: @notionhq/client for documentation and tracking
- **Security**: Cequence AI Gateway + Descope Authentication
- **Deployment**: Containerized with Docker, deployable to Fly.io, Render, or any container platform

## 🎥 Demo Video

[Watch our demo video here](https://youtu.be/your_video_id)

## 🌐 Smithery MCP Server Link

Access our MCP server on Smithery: [https://smithery.ai/workflowgenie](https://smithery.ai/your_smithery_id)

### Using the MCP Server with Claude

1. In Claude Desktop, enable Developer Settings
2. Add our Smithery MCP URL as a custom server
3. Use the "schedule_code_review" tool to coordinate GitHub pull request reviews

Example prompt:
```
Schedule a code review for pull request #123 in the repository "codecraft/project-alpha" with high urgency.
```

### Connecting to the MCP Server via the API

You can also connect directly to our MCP server using HTTP requests:

```bash
# List available tools
curl -X POST https://smithery.ai/your_smithery_id/v1/tools/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Call a tool
curl -X POST https://smithery.ai/your_smithery_id/v1/tools/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"schedule_code_review","arguments":{"pr_number":"123","repository":"codecraft/project-alpha","urgency":"high"}}'
```

## 📋 How to Run Locally

### Prerequisites

- Node.js 18 or higher
- API keys for GitHub, Slack, Google Calendar, Notion
- Cequence AI Gateway account
- Descope account

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Geethapranay1/workflowgenie.git
   cd workflowgenie-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit the .env file with your API keys and configuration
   ```

4. **Run the server**
   ```bash
   npm start
   ```

5. **Access the server**
   The server will be running at http://localhost:3000

### Testing

Run the complete workflow test to see WorkflowGenie in action:

```bash
npm run test:workflow
```

Or test individual integrations:

```bash
npm run test:github
npm run test:slack
npm run test:calendar
```

## 🧠 MCP Tool Specifications

### Tool: schedule_code_review

Schedules a comprehensive code review process across multiple platforms.

**Input Schema:**
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

**Output Example:**
```json
{
  "success": true,
  "message": "Code review scheduled for PR #123",
  "executionTime": "1254ms",
  "details": {
    "repository": "facebook/react",
    "pr_number": "123",
    "slack_channel": "#pr-123-fix-login-bug",
    "github_pr": "https://github.com/facebook/react/pull/123",
    "meeting": {
      "title": "Code Review: PR #123 - Fix login bug",
      "time": "2025-09-10T14:00:00Z",
      "duration": "45 minutes",
      "attendees": ["john@example.com", "sarah@example.com"],
      "videoCall": "https://meet.google.com/abc-defg-hij"
    },
    "notion": {
      "pageId": "8a7b6c5d-4e3f-2g1h-0i9j-8k7l6m5n4o3p",
      "url": "https://notion.so/workspace/8a7b6c5d4e3f2g1h0i9j8k7l6m5n4o3p"
    }
  }
}
```

## 🔮 What We'd Do with More Time

1. **Additional Workflows**:
   - Project kickoff automation
   - Incident response coordination
   - Sprint planning orchestration

2. **Enhanced Integrations**:
   - Microsoft Teams integration for Microsoft-centric workplaces
   - Jira/Asana for expanded project management capabilities
   - Confluence for comprehensive documentation

3. **Advanced Features**:
   - AI-powered meeting summaries and action items extraction
   - Automated progress tracking and status updates
   - Smart scheduling based on productivity patterns and team preferences
   - Advanced rollback and error recovery mechanisms

4. **Platform Extensions**:
   - Custom workflow builder UI for non-technical users
   - Expanded analytics dashboard for workflow performance
   - Organization-specific templates and best practices

## 📝 Additional Resources

- [Project Documentation](./docs/)
- [API Documentation](./docs/API.md)
- [Quick Start Guide](./docs/QUICKSTART.md)

## 🔐 Security Considerations

WorkflowGenie prioritizes security at every level:

1. **Cequence AI Gateway**: Enterprise-grade security and monitoring
2. **Descope Authentication**: Secure token validation and management
3. **Scoped API Tokens**: Limited permissions for third-party services
4. **Audit Logging**: Detailed logs of all AI agent activities
5. **Error Handling**: Graceful handling of failures with rollbacks

## 📜 License

MIT

---
