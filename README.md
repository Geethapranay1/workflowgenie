# WorkflowGenie MCP Server

🚀 **An intelligent MCP (Model Context Protocol) server that orchestrates complex workflows across multiple workplace applications with enterprise-grade security.**

## What It Does (In Simple Terms)

Imagine you have a magic assistant that can talk to ALL your work apps at once. Instead of you jumping between Slack, Google Calendar, GitHub, Notion, etc., you just tell the AI agent what you want to accomplish, and it does everything for you - safely and smartly.

### The Magic Scenario

**You say:** "Plan a code review meeting for the login bug fix"

**WorkflowGenie automatically:**
- Finds the bug report in your project management tool
- Locates the related code changes in GitHub
- Identifies who needs to be in the meeting
- Checks everyone's calendars and finds a free time
- Creates a Slack channel for discussion
- Schedules the meeting with all context attached
- Updates the bug status to "Under Review"

All in 30 seconds. All secure. All with proper permissions.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AI Agent      │───▶│  WorkflowGenie   │───▶│   Your Apps     │
│   (Claude)      │    │   MCP Server     │    │ Slack, GitHub   │
└─────────────────┘    └──────────────────┘    │ Calendar, etc.  │
                              │                 └─────────────────┘
                              ▼
                       ┌──────────────────┐
                       │  Security Layer  │
                       │ (Cequence+Descope)│
                       └──────────────────┘
```

## ✨ Features

### 🔧 Core Workflows
- **Code Review Orchestration**: Automatically coordinate GitHub PRs, Slack channels, and calendar meetings
- **Project Kickoffs**: Set up complete project infrastructure across all platforms
- **Incident Response**: Coordinate team communication and tracking during outages
- **Sprint Planning**: Sync GitHub issues, calendar events, and team notifications

### 🚀 Implemented Workflows
- **Code Review Scheduling**: Complete integration between GitHub, Slack, Google Calendar, and Notion
  - Fetches PR details and involved developers from GitHub
  - Creates dedicated Slack channel for review discussions
  - Finds optimal meeting time based on reviewers' calendar availability
  - Schedules a calendar event with video conferencing
  - Creates a Notion page with code review checklist and context
  - Updates all systems with links to the others for seamless navigation

### 🔐 Security First
- **Cequence AI Gateway**: Enterprise-grade API security and monitoring
- **Descope Authentication**: Secure OAuth flows for all integrations
- **Scoped Permissions**: Users only access what they're authorized for
- **Audit Logging**: Complete trail of all AI-initiated actions

### 🔗 Integrations
- **Slack**: Messaging, channels, user management
- **GitHub**: Pull requests, issues, repository access
- **Google Calendar**: Meeting scheduling, availability checking
- **Notion**: Documentation, project tracking

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Accounts for: Cequence AI, Descope, Slack, GitHub, Google, Notion

### Installation

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
# Edit .env with your API keys and credentials
```

4. **Set up integrations**
```bash
# Run setup wizard for all integrations
npm run setup
```

5. **Start the server**
```bash
npm start
```

### Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Cequence AI Gateway (Required)
CEQUENCE_API_KEY=your_cequence_api_key_here
CEQUENCE_BASE_URL=https://api.cequence.ai
CEQUENCE_PROXY_ENDPOINT=your_proxy_endpoint_here

# Descope Authentication (Required)
DESCOPE_PROJECT_ID=your_descope_project_id_here
DESCOPE_MANAGEMENT_KEY=your_descope_management_key_here

# Slack Integration
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here
SLACK_TEST_TOKEN=xoxb-your-bot-token-here

# GitHub Integration
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_TEST_TOKEN=ghp_your_github_token_here

# Google Calendar Integration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Notion Integration
NOTION_CLIENT_ID=your_notion_client_id_here
NOTION_CLIENT_SECRET=your_notion_client_secret_here
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Test Individual Integrations
```bash
# Test GitHub integration
npm run test:github

# Test Slack integration
npm run test:slack

# Test full workflow
npm run test:workflow
```

### Test Real Workflow
```bash
# Test with actual GitHub PR and Slack channel
npm run test:real-workflow
```

## 🔧 Available MCP Tools

### Primary Workflows

#### `schedule_code_review`
Orchestrates a complete code review process across multiple platforms.

```javascript
{
  "name": "schedule_code_review",
  "arguments": {
    "pr_number": "123",
    "repository": "owner/repo",
    "urgency": "high"
  }
}
```

**What it does:**
1. Fetches PR details from GitHub
2. Identifies required reviewers
3. Checks calendar availability
4. Creates Slack channel for discussion
5. Schedules review meeting
6. Sends notifications to all participants

#### `create_project_kickoff`
Sets up complete project infrastructure.

```javascript
{
  "name": "create_project_kickoff",
  "arguments": {
    "project_name": "New Auth System",
    "team_members": ["alice@company.com", "bob@company.com"],
    "deadline": "2024-12-01"
  }
}
```

### Building Block Tools

#### Slack Operations
- `send_slack_message`: Send messages to channels
- `create_slack_channel`: Create new channels
- `get_slack_users`: Retrieve user information

#### GitHub Operations
- `get_pull_request`: Fetch PR details
- `create_github_issue`: Create new issues
- `get_suggested_reviewers`: AI-powered reviewer suggestions

#### Calendar Operations
- `find_free_time`: Check availability across multiple calendars
- `create_meeting`: Schedule meetings with participants
- `get_calendar_events`: Retrieve upcoming events

## 🔐 Security Model

### Authentication Flow
1. **User Authentication**: Handled by Descope with OAuth2/OIDC
2. **API Security**: All requests routed through Cequence AI Gateway
3. **Permission Validation**: Scoped access per user per application
4. **Audit Logging**: Complete trail of all AI actions

### Permission Scopes

**Slack Permissions:**
- `channels:read` - View channel information
- `channels:write` - Create and manage channels
- `chat:write` - Send messages
- `users:read` - Access user profiles

**GitHub Permissions:**
- `repo` - Access repositories
- `read:user` - Read user information
- `write:issue` - Create and modify issues

**Google Calendar Permissions:**
- `calendar.readonly` - View calendar events
- `calendar.events` - Create and modify events

## 🏗️ Architecture Details

### Core Components

```
src/
├── server.js              # MCP server entry point
├── config/
│   └── environment.js     # Configuration management
├── integrations/          # App-specific connectors
│   ├── slack.js
│   ├── github.js
│   ├── calendar.js
│   ├── cequence.js        # Security gateway
│   └── descope.js         # Authentication
├── services/
│   └── orchestrator.js    # Workflow coordination
└── utils/
    └── logger.js          # Structured logging
```

### Request Flow

1. **AI Agent** sends MCP request to WorkflowGenie
2. **Cequence Gateway** validates and routes the request
3. **Descope** authenticates the user and validates permissions
4. **Orchestrator** breaks down complex workflows into steps
5. **Connectors** execute individual app operations
6. **Results** are aggregated and returned to the AI agent

## 📊 Monitoring & Observability

### Logging
- Structured JSON logging with Winston
- Request/response tracking with correlation IDs
- Performance metrics for each operation
- Security audit trail

### Metrics
- API response times
- Success/failure rates
- User activity patterns
- Resource utilization

### Health Checks
```bash
# Check server health
curl http://localhost:3000/health

# Check integration status
curl http://localhost:3000/health/integrations
```

## 🚀 Deployment

### Production Deployment

1. **Deploy to cloud platform** (Fly.io, Render, or AWS)
```bash
# Example for Fly.io
fly launch
fly deploy
```

2. **Configure production environment**
```bash
# Set production environment variables
fly secrets set CEQUENCE_API_KEY=prod_key
fly secrets set DESCOPE_PROJECT_ID=prod_project
```

3. **Verify deployment**
```bash
curl https://your-app.fly.dev/health
```

### Claude Desktop Integration

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "workflowgenie": {
      "command": "node",
      "args": ["/path/to/workflowgenie-mcp/src/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

<!-- ## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request -->

### Development Guidelines
- Follow ESLint configuration
- Add tests for new features
- Update documentation
- Ensure security best practices

## 📝 API Documentation

### MCP Protocol Compliance
WorkflowGenie implements the full MCP specification:
- **Tools**: Callable functions with JSON schemas
- **Resources**: Access to external data sources
- **Prompts**: Template-based interactions

### Tool Schemas
All tools include comprehensive JSON schemas for validation:

```javascript
{
  "type": "object",
  "properties": {
    "pr_number": {
      "type": "string",
      "description": "Pull request number"
    }
  },
  "required": ["pr_number"]
}
```

## 🛠️ Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check Node.js version
node --version  # Should be 18+

# Check dependencies
npm install

# Check environment variables
npm run check-env
```

**Integration failures:**
```bash
# Test individual integrations
npm run test:slack
npm run test:github

# Check API credentials
npm run verify-credentials
```

**Permission errors:**
- Verify OAuth scopes in each app
- Check Descope user permissions
- Review Cequence gateway logs

### Debug Mode
```bash
DEBUG=workflowgenie:* npm start
```
<!-- 
## 📄 License

MIT License - see [LICENSE](LICENSE) file for details. -->

<!-- ## 🙋‍♂️ Support

- **Issues**: [GitHub Issues](https://github.com/your-username/workflowgenie-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/workflowgenie-mcp/discussions)
- **Email**: support@workflowgenie.dev -->

## 🎯 Roadmap

### v2.0 (Q1 2025)
- [ ] Notion integration
- [ ] Jira/Linear support
- [ ] Custom workflow builder UI
- [ ] Advanced analytics dashboard

### v3.0 (Q2 2025)
- [ ] Multi-tenant support
- [ ] Workflow templates marketplace
- [ ] Mobile app for approvals
- [ ] Enterprise SSO integration

---

**Built with ❤️ for the MCP ecosystem**

*WorkflowGenie makes AI agents truly useful by giving them secure, coordinated access to all your workplace tools.*