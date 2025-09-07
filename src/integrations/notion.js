import { Client } from '@notionhq/client';
import { logger, createPerformanceTimer } from '../utils/logger.js';

export class NotionConnector {
  constructor() {
    this.clients = new Map();
    this.isInitialized = false;
    this.databaseCache = new Map();
  }

  async initialize() {
    logger.info('Initializing Notion connector...');
    this.isInitialized = true;
    logger.info('✅ Notion connector initialized');
  }

  getClient(userToken) {
    if (!userToken) {
      throw new Error('Notion token required for API access');
    }

    if (this.clients.has(userToken)) {
      return this.clients.get(userToken);
    }

    const client = new Client({
      auth: userToken,
    });

    this.clients.set(userToken, client);
    return client;
  }

  async createProjectPage(projectData, userToken, requestId) {
    const timer = createPerformanceTimer('notion_create_project');
    
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Creating Notion project page', {
        requestId,
        projectName: projectData.name
      });

      // Create main project page
      const pageResponse = await client.pages.create({
        parent: { database_id: projectData.databaseId },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: projectData.name
                }
              }
            ]
          },
          Status: {
            select: {
              name: 'Planning'
            }
          },
          'Project Lead': {
            people: projectData.teamMembers.map(email => ({ email }))
          },
          Deadline: {
            date: {
              start: projectData.deadline
            }
          }
        },
        children: [
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ type: 'text', text: { content: 'Project Overview' } }]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: projectData.description || 'Project description to be added.' } }]
            }
          }
        ]
      });

      // Create project resources database
      const resourcesDb = await client.databases.create({
        parent: { page_id: pageResponse.id },
        title: [
          {
            text: {
              content: 'Project Resources'
            }
          }
        ],
        properties: {
          Name: {
            title: {}
          },
          Type: {
            select: {
              options: [
                { name: 'Document', color: 'blue' },
                { name: 'Meeting Notes', color: 'green' },
                { name: 'Design', color: 'purple' },
                { name: 'Code', color: 'orange' }
              ]
            }
          },
          Status: {
            status: {
              options: [
                { name: 'Draft', color: 'gray' },
                { name: 'In Review', color: 'yellow' },
                { name: 'Final', color: 'green' }
              ]
            }
          },
          Owner: {
            people: {}
          }
        }
      });

      logger.info('Notion project space created', {
        requestId,
        projectId: pageResponse.id,
        resourcesDbId: resourcesDb.id,
        executionTime: timer.end()
      });

      return {
        projectPageId: pageResponse.id,
        projectPageUrl: pageResponse.url,
        resourcesDatabaseId: resourcesDb.id,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      timer.end();
      
      logger.error('Failed to create Notion project', {
        requestId,
        error: error.message
      });
      
      throw new Error(`Failed to create Notion project: ${error.message}`);
    }
  }

  async getProjectDetails(pageId, userToken, requestId) {
    const timer = createPerformanceTimer('notion_get_project');
    
    try {
      const client = this.getClient(userToken);
      
      const response = await client.pages.retrieve({
        page_id: pageId
      });

      const { properties } = response;

      return {
        id: response.id,
        title: properties.Name.title[0]?.plain_text || '',
        status: properties.Status?.select?.name || '',
        deadline: properties.Deadline?.date?.start || null,
        teamMembers: properties['Project Lead']?.people?.map(p => p.email) || [],
        lastEditedTime: response.last_edited_time,
        url: response.url
      };

    } catch (error) {
      timer.end();
      throw new Error(`Failed to get project details: ${error.message}`);
    }
  }

  async updateProjectStatus(pageId, status, userToken, requestId) {
    const timer = createPerformanceTimer('notion_update_status');
    
    try {
      const client = this.getClient(userToken);
      
      await client.pages.update({
        page_id: pageId,
        properties: {
          Status: {
            select: {
              name: status
            }
          }
        }
      });

      logger.info('Project status updated', {
        requestId,
        pageId,
        status,
        executionTime: timer.end()
      });

    } catch (error) {
      timer.end();
      throw new Error(`Failed to update project status: ${error.message}`);
    }
  }

  async createDocument(databaseId, document, userToken, requestId) {
    const timer = createPerformanceTimer('notion_create_document');
    
    try {
      const client = this.getClient(userToken);
      
      const response = await client.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: document.title
                }
              }
            ]
          },
          Type: {
            select: {
              name: document.type
            }
          },
          Status: {
            status: {
              name: 'Draft'
            }
          },
          Owner: {
            people: document.owners.map(email => ({ email }))
          }
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: document.content || '' } }]
            }
          }
        ]
      });

      logger.info('Document created in Notion', {
        requestId,
        documentId: response.id,
        title: document.title,
        executionTime: timer.end()
      });

      return {
        id: response.id,
        url: response.url
      };

    } catch (error) {
      timer.end();
      throw new Error(`Failed to create document: ${error.message}`);
    }
  }

  async cleanup() {
    this.clients.clear();
    this.databaseCache.clear();
    logger.info('Notion connector cleaned up');
  }
}
