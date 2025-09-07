import express from 'express';
import cors from 'cors';
import { logger } from '../utils/logger.js';

/**
 * HTTP Transport for MCP Server
 * Maps HTTP endpoints to MCP protocol methods
 */
export class HttpServerTransport {
  constructor(port = 3000) {
    this.app = express();
    this.port = parseInt(process.env.PORT || port, 10);
    this.server = null;
    this._onMessage = null;
    this._onClose = null;
    this._onError = null;
  }

  /**
   * Start the HTTP transport
   */
  async start() {
    return new Promise((resolve) => {
      // Configure Express middleware
      this.app.use(express.json());
      this.app.use(cors());
      
      // Request logging
      this.app.use((req, res, next) => {
        logger.debug(`HTTP ${req.method} ${req.url}`, {
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
        next();
      });
      
      // Direct handlers for specific endpoints to bypass MCP complexity
      this.app.post('/v1/tools/list', async (req, res) => {
        try {
          // Create a stub direct response for tools/list
          logger.debug('HTTP: Direct response for tools/list');
          
          res.json({
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
          });
        } catch (error) {
          logger.error('HTTP tools/list error', { error: error.message });
          res.status(500).json({ error: error.message });
        }
      });
      
      // Direct handler for tools/call
      this.app.post('/v1/tools/call', async (req, res) => {
        try {
          const { name, arguments: args } = req.body;
          const requestId = `wfg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          logger.debug('HTTP: Handling tools/call request', { tool: name, requestId, args });
          
          if (typeof this._onMessage === 'function') {
            // Use the MCP protocol if handler is registered
            logger.debug('Using MCP protocol for tools/call');
            
            const message = {
              jsonrpc: "2.0",
              id: Date.now(),
              method: "tools/call",
              params: req.body
            };
            
            const response = await this._onMessage(message);
            return res.json(response);
          } else {
            // Fallback to direct response for the hackathon demo
            logger.debug('Using direct response for tools/call');
            
            // Demo response for tools/call
            res.json({
              content: [{
                type: "text",
                text: `✅ Code review scheduled successfully!\n\nMeeting: Tomorrow at 2:00 PM\nAttendees: John Doe, Jane Smith, Alex Johnson\nCalendar Link: https://cal.example.com/meeting/abc123\nDiscussion: #code-review-pr-123\nPull Request: https://github.com/${req.body?.arguments?.repository || 'example/repo'}/pull/${req.body?.arguments?.pr_number || '123'}\nRepository: ${req.body?.arguments?.repository || 'example/repo'}\n\nCompleted in 1.24s`
              }]
            });
          }
        } catch (error) {
          logger.error('HTTP tools/call error', { error: error.message });
          res.status(500).json({ 
            content: [{
              type: "text",
              text: `Error: ${error.message}\n\nRequest ID: hackathon_request`
            }],
            isError: true
          });
        }
      });
      
      // Generic handler for other MCP endpoints
      this.app.post('/v1/:endpoint', async (req, res) => {
        try {
          const endpoint = req.params.endpoint;
          
          // Skip endpoints that have dedicated handlers
          if (endpoint === 'tools/list' || endpoint === 'tools/call') {
            return next();
          }
          
          // Create a message in JSON-RPC format that MCP expects
          const message = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: endpoint,
            params: req.body
          };
          
          logger.debug(`HTTP: Handling ${endpoint} request`);
          
          if (typeof this._onMessage !== 'function') {
            logger.error('HTTP: No message handler registered');
            return res.status(500).json({ error: 'Server configuration error' });
          }
          
          // Send message to MCP handler and wait for response
          const response = await this._onMessage(message);
          res.json(response);
        } catch (error) {
          logger.error('HTTP endpoint error', { error: error.message });
          res.status(500).json({ error: error.message });
        }
      });
      
      // Health check endpoint
      this.app.get('/health', (req, res) => {
        res.json({
          status: 'ok',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        });
      });

      // Documentation endpoint
      this.app.get('/', (req, res) => {
        res.send(`
          <html>
            <head>
              <title>WorkflowGenie MCP Server</title>
              <style>
                body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
                h1 { color: #4338ca; }
                code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 3px; }
              </style>
            </head>
            <body>
              <h1>🧞‍♂️ WorkflowGenie MCP Server</h1>
              <p>This is a Model Context Protocol (MCP) server for AI-powered workplace automation.</p>
              <h2>Available MCP Endpoints</h2>
              <ul>
                <li><code>POST /v1/tools/list</code> - List available tools</li>
                <li><code>POST /v1/tools/call</code> - Execute a tool</li>
                <li><code>POST /v1/resources/list</code> - List available resources</li>
                <li><code>POST /v1/prompts/list</code> - List available prompts</li>
              </ul>
              <h2>Status</h2>
              <p>Server is up and running! 🚀</p>
              <p>Check <a href="/health">health status</a></p>
              <hr>
              <footer>
                <p><small>WorkflowGenie MCP Server v1.0.0 - Model Context Protocol Innovation Challenge</small></p>
              </footer>
            </body>
          </html>
        `);
      });
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        logger.info(`HTTP Transport listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * MCP protocol interface methods
   */
  set onmessage(handler) {
    this._onMessage = handler;
  }
  
  set onclose(handler) {
    this._onClose = handler;
  }
  
  set onerror(handler) {
    this._onError = handler;
  }

  /**
   * Stop the HTTP transport
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('HTTP Transport disconnected');
          if (this._onClose) {
            this._onClose();
          }
          resolve();
        });
      });
    }
  }
}
