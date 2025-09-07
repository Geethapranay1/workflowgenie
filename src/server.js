import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpServerTransport } from './transport/http.js';
import { config, validateConfig } from './config/environment.js';
import { CequenceGateway } from './integrations/cequence.js';
import { DescopeAuth } from './integrations/descope.js';
import { WorkflowOrchestrator } from './services/orchestrator.js';
import { logger } from './utils/logger.js';
import { z } from 'zod';

// Create MCP Schema definitions
const createMCPSchema = (methodName) => {
  return {
    shape: {
      method: {
        value: methodName
      }
    },
    parse: (request) => request
  };
};

// Define schemas for all endpoints
const ToolsListRequestSchema = createMCPSchema("tools/list");
const ToolsCallRequestSchema = createMCPSchema("tools/call");
const ResourcesListRequestSchema = createMCPSchema("resources/list");
const PromptsListRequestSchema = createMCPSchema("prompts/list");

class WorkflowGenieServer {
  constructor() {
    this.server = new Server({
      name: config.mcp.name,
      version: config.mcp.version,
      description: config.mcp.description
    });
    
    // Fix MCP SDK handler registration
    this.patchServerRequestHandlers();
    
    this.cequence = new CequenceGateway(config.cequence);
    this.descope = new DescopeAuth(config.descope);
    this.orchestrator = new WorkflowOrchestrator();
    
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }
  
  patchServerRequestHandlers() {
    // Get the prototype of the server object
    const proto = Object.getPrototypeOf(this.server);
    
    // Store the original setRequestHandler method
    const originalSetRequestHandler = proto.setRequestHandler;
    
    // Replace with our version that accepts string methods
    proto.setRequestHandler = function(methodOrSchema, handler) {
      if (typeof methodOrSchema === 'string') {
        logger.debug(`MCP: Converting string method "${methodOrSchema}" to schema object`);
        const schemaObj = {
          shape: {
            method: {
              value: methodOrSchema
            }
          },
          parse: function(request) {
            return request;
          }
        };
        return originalSetRequestHandler.call(this, schemaObj, handler);
      }
      return originalSetRequestHandler.call(this, methodOrSchema, handler);
    };
    
    logger.info('MCP SDK patched to accept string method names');
  }

  setupToolHandlers() {
    this.server.setRequestHandler("tools/list", async (request) => {
      const enrichedRequest = this.cequence.enrichRequestMetadata(request, {
        action: 'list_tools'
      });
      
      logger.info('Tools list requested via Cequence proxy', {
        'x-cequence-tracked': true
      });
      
      return {
        tools: [
          {
            name: "schedule_code_review",
            description: "Schedule a code review meeting with automatic team coordination across GitHub, Slack, Calendar, and Notion",
            inputSchema: {
              type: "object",
              properties: {
                pr_number: {
                  type: "string",
                  description: "Pull request number (e.g., '123')"
                },
                repository: {
                  type: "string", 
                  description: "Repository name in format 'owner/repo'"
                },
                urgency: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  default: "medium"
                }
              },
              required: ["pr_number", "repository"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = this.generateRequestId();
      
      const enrichedRequest = this.cequence.enrichRequestMetadata(request, {
        action: 'tool_call',
        tool: name,
        requestId
      });
      
      logger.info(`Tool call via Cequence: ${name}`, { 
        requestId,
        'x-cequence-tracked': true 
      });

      try {
        // Handle user authentication - optional for hackathon
        let userContext = {};
        
        if (this.skipAuthentication) {
          // Use mock user context if authentication is disabled
          userContext = {
            userId: 'hackathon_user',
            email: 'demo@example.com',
            name: 'Hackathon Demo User',
            permissions: ['all'],
            roles: ['demo_user'],
            tokens: {},
            validated: true,
            validatedAt: new Date().toISOString()
          };
          logger.debug('Using mock user context (auth disabled)', { requestId });
        } else {
          // Normal authentication flow
          userContext = await this.descope.validateUser(request.meta?.userToken);
        }
        
        let result;
        switch (name) {
          case "schedule_code_review":
            result = await this.orchestrator.scheduleCodeReview(args, userContext, requestId);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        this.cequence.logToolExecution(name, result, userContext);

        return {
          content: [{
            type: "text",
            text: this.formatToolResponse(result)
          }]
        };

      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, {
          requestId,
          error: error.message,
          'x-cequence-tracked': true
        });

        return {
          content: [{
            type: "text", 
            text: `Error: ${error.message}\n\nRequest ID: ${requestId}`
          }],
          isError: true
        };
      }
    });
  }

  setupResourceHandlers() {
    this.server.setRequestHandler("resources/list", async () => {
      return { resources: [] };
    });
  }

  setupPromptHandlers() {
    this.server.setRequestHandler("prompts/list", async () => {
      return { prompts: [] };
    });
  }

  formatToolResponse(result) {
    if (!result.success) {
      return `Operation Failed\n\n${result.message}`;
    }

    const { message, details, executionTime } = result;
    
    let formatted = `${message}\n\n`;
    
    if (details) {
      if (details.meeting) {
        formatted += `Meeting: ${details.meeting.time}\n`;
        formatted += `Attendees: ${details.meeting.attendees.join(', ')}\n`;
        if (details.meeting.link) {
          formatted += `Calendar Link: ${details.meeting.link}\n`;
        }
      }
      
      if (details.slack_channel) {
        formatted += `Discussion: ${details.slack_channel}\n`;
      }
      
      if (details.github_pr) {
        formatted += `Pull Request: ${details.github_pr}\n`;
      }
      
      if (details.notion_page) {
        formatted += `Documentation: ${details.notion_page}\n`;
      }
      
      if (details.repository) {
        formatted += `Repository: ${details.repository}\n`;
      }
    }
    
    formatted += `\nCompleted in ${executionTime}`;
    
    return formatted;
  }

  generateRequestId() {
    return `wfg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async start() {
    try {
      validateConfig();
      
      await this.cequence.initialize();
      
      // Make Descope authentication optional for hackathon
      try {
        await this.descope.initialize();
      } catch (error) {
        logger.warn('Descope authentication disabled - continuing without auth', {
          error: error.message
        });
        this.skipAuthentication = true;
      }
      
      await this.orchestrator.initialize();
      
      // Determine transport type based on environment
      let transport;
      if (process.env.TRANSPORT === 'http' || config.nodeEnv === 'production') {
        // Use HTTP transport for production or when explicitly requested
        transport = new HttpServerTransport(config.port);
        await this.server.connect(transport);
        logger.info(`HTTP transport enabled on port ${config.port}`);
      } else {
        // Default to stdio for local development
        transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('Stdio transport enabled');
      }
      
      logger.info(`WorkflowGenie MCP Server started successfully`, {
        version: config.mcp.version,
        environment: config.nodeEnv
      });
      
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start WorkflowGenie server', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down WorkflowGenie server...');
    
    try {
      await this.orchestrator.cleanup();
      await this.descope.cleanup();
      await this.cequence.cleanup();
      
      logger.info('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WorkflowGenieServer();
  server.start().catch((error) => {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  });
}

export { WorkflowGenieServer };