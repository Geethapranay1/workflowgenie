import { Client } from '@notionhq/client';
import { logger, createPerformanceTimer } from '../utils/logger.js';

export class NotionConnector {
  constructor() {
    this.clients = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('Initializing Notion connector...');
    this.isInitialized = true;
    logger.info('Notion connector initialized');
  }

  getClient(userToken) {
    if (!userToken) {
      throw new Error('Notion token required for API access');
    }

    if (this.clients.has(userToken)) {
      return this.clients.get(userToken);
    }

    const client = new Client({
      auth: userToken
    });

    this.clients.set(userToken, client);
    return client;
  }

  async createCodeReviewPage(prDetails, meetingDetails, userToken, requestId) {
    const timer = createPerformanceTimer('notion_create_review_page');
    
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Creating Notion page for code review', {
        requestId,
        repository: prDetails.repository,
        prNumber: prDetails.number
      });

      // Default database ID from environment variable if not specified
      const databaseId = process.env.NOTION_DEFAULT_DATABASE_ID;
      
      if (!databaseId) {
        throw new Error('Notion database ID not configured');
      }

      const pageData = {
        parent: {
          database_id: databaseId
        },
        properties: {
          Title: {
            title: [
              {
                text: {
                  content: `Code Review: PR #${prDetails.number} - ${prDetails.title}`
                }
              }
            ]
          },
          Status: {
            select: {
              name: 'Pending'
            }
          },
          Repository: {
            rich_text: [
              {
                text: {
                  content: prDetails.repository
                }
              }
            ]
          },
          'PR Number': {
            number: parseInt(prDetails.number, 10)
          },
          'PR Link': {
            url: prDetails.urls.html
          },
          Author: {
            rich_text: [
              {
                text: {
                  content: prDetails.author.login
                }
              }
            ]
          },
          'Meeting Date': meetingDetails ? {
            date: {
              start: meetingDetails.start.toISOString(),
              end: meetingDetails.end.toISOString()
            }
          } : null
        },
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Code Review Details'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Repository: ${prDetails.repository}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Pull Request: #${prDetails.number}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Title: ${prDetails.title}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Author: ${prDetails.author.name || prDetails.author.login}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Changes: ${prDetails.stats.changedFiles} files changed, ${prDetails.stats.additions} additions, ${prDetails.stats.deletions} deletions`
                  }
                }
              ]
            }
          }
        ]
      };

      // Add PR description if available
      if (prDetails.description) {
        pageData.children.push(
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Description'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: prDetails.description
                  }
                }
              ]
            }
          }
        );
      }

      // Add meeting details if available
      if (meetingDetails) {
        pageData.children.push(
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Meeting Details'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Time: ${meetingDetails.start.toLocaleString()}`
                  }
                }
              ]
            }
          }
        );

        if (meetingDetails.videoCall?.joinUrl) {
          pageData.children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Video call: '
                  }
                },
                {
                  type: 'text',
                  text: {
                    content: 'Join meeting',
                    link: {
                      url: meetingDetails.videoCall.joinUrl
                    }
                  }
                }
              ]
            }
          });
        }

        if (meetingDetails.attendees && meetingDetails.attendees.length > 0) {
          pageData.children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Attendees: ${meetingDetails.attendees.map(a => a.email || a).join(', ')}`
                  }
                }
              ]
            }
          });
        }
      }

      // Add review checklist
      pageData.children.push(
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Review Checklist'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Code follows style guidelines'
                }
              }
            ],
            checked: false
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Tests added/updated'
                }
              }
            ],
            checked: false
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Documentation updated'
                }
              }
            ],
            checked: false
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'PR ready to merge'
                }
              }
            ],
            checked: false
          }
        }
      );

      const response = await client.pages.create(pageData);
      
      logger.info('Notion page created successfully', {
        requestId,
        pageId: response.id,
        title: `Code Review: PR #${prDetails.number}`,
        executionTime: timer.end()
      });

      return {
        id: response.id,
        url: response.url,
        title: `Code Review: PR #${prDetails.number} - ${prDetails.title}`,
        createdAt: new Date()
      };

    } catch (error) {
      timer.end();
      
      logger.error('Failed to create Notion page', {
        requestId,
        error: error.message
      });
      
      throw error;
    }
  }

  async updateCodeReviewStatus(pageId, status, comments, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Updating code review status in Notion', {
        requestId,
        pageId,
        status
      });

      // Update status property
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

      // Add comments if provided
      if (comments) {
        await client.blocks.children.append({
          block_id: pageId,
          children: [
            {
              object: 'block',
              type: 'heading_3',
              heading_3: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: 'Review Comments'
                    }
                  }
                ]
              }
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: comments
                    }
                  }
                ]
              }
            }
          ]
        });
      }

      logger.info('Notion page updated successfully', {
        requestId,
        pageId,
        status
      });

      return {
        success: true,
        pageId,
        status
      };

    } catch (error) {
      logger.error('Failed to update Notion page', {
        requestId,
        error: error.message,
        pageId
      });
      
      throw error;
    }
  }

  async searchCodeReviews(query, userToken, requestId) {
    try {
      const client = this.getClient(userToken);
      
      logger.debug('Searching code reviews in Notion', {
        requestId,
        query
      });

      const databaseId = process.env.NOTION_DEFAULT_DATABASE_ID;
      
      if (!databaseId) {
        throw new Error('Notion database ID not configured');
      }

      const response = await client.databases.query({
        database_id: databaseId,
        filter: {
          or: [
            {
              property: 'Title',
              rich_text: {
                contains: query
              }
            },
            {
              property: 'Repository',
              rich_text: {
                contains: query
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Meeting Date',
            direction: 'descending'
          }
        ]
      });

      const results = response.results.map(page => {
        return {
          id: page.id,
          url: page.url,
          title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
          status: page.properties.Status?.select?.name || 'Unknown',
          repository: page.properties.Repository?.rich_text?.[0]?.plain_text,
          prNumber: page.properties['PR Number']?.number,
          meetingDate: page.properties['Meeting Date']?.date?.start ? 
            new Date(page.properties['Meeting Date'].date.start) : null
        };
      });

      logger.info('Notion search completed', {
        requestId,
        resultsCount: results.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to search Notion', {
        requestId,
        error: error.message
      });
      
      throw error;
    }
  }

  async cleanup() {
    logger.info('Cleaning up Notion connector...');
    // Nothing specific to clean up
    logger.info('Notion connector cleanup complete');
  }
}