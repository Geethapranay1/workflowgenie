import { Octokit } from '@octokit/rest';
import { logger, createPerformanceTimer } from '../utils/logger.js';

export class GitHubConnector {
  constructor() {
    this.clients = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('Initializing GitHub connector...');
    this.isInitialized = true;
    logger.info('GitHub connector initialized');
  }

  getClient(userToken) {
    // For hackathon demo purposes - handle missing tokens gracefully
    if (!userToken) {
      // Use environment fallback if available for demos/tests
      const envToken = process.env.GITHUB_TEST_TOKEN || process.env.GITHUB_TOKEN;
      
      if (envToken) {
        logger.debug('Using GitHub token from environment');
        userToken = envToken;
      } else {
        // For hackathon demo, we could still proceed in a read-only mode
        logger.warn('No GitHub token provided - some operations may fail');
      }
    }

    if (userToken && this.clients.has(userToken)) {
      return this.clients.get(userToken);
    }

    const client = new Octokit({
      auth: userToken,
      userAgent: 'WorkflowGenie-MCP/1.0.0',
      timeZone: 'UTC',
      request: {
        timeout: 10000
      }
    });

    client.hook.before('request', (options) => {
      logger.debug('GitHub API Request', {
        method: options.method,
        url: options.url,
        rateLimit: options.headers?.['x-ratelimit-remaining']
      });
    });

    client.hook.after('request', (response, options) => {
      logger.debug('GitHub API Response', {
        status: response.status,
        url: options.url,
        rateLimit: response.headers['x-ratelimit-remaining']
      });
    });

    client.hook.error('request', (error, options) => {
      logger.error('GitHub API Error', {
        status: error.status,
        message: error.message,
        url: options.url
      });
    });

    this.clients.set(userToken, client);
    return client;
  }

  async getPullRequest(repository, prNumber, userToken, requestId) {
    const timer = createPerformanceTimer('github_get_pull_request');
    
    try {
      const [owner, repo] = repository.split('/');
      
      // For hackathon demos - provide mock data when running without tokens
      if (!userToken && !process.env.GITHUB_TEST_TOKEN && !process.env.GITHUB_TOKEN) {
        logger.info('Using mock PR data for demo (no token available)', { 
          repository, prNumber, requestId 
        });
        
        // Return mock data for demo purposes
        return this._createMockPrData(repository, prNumber);
      }
      
      const client = this.getClient(userToken);
      
      logger.debug('Fetching pull request details', {
        requestId,
        repository,
        prNumber
      });

      const { data: pr } = await client.rest.pulls.get({
        owner,
        repo,
        pull_number: parseInt(prNumber)
      });

      const { data: files } = await client.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: parseInt(prNumber)
      });

      const { data: reviews } = await client.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: parseInt(prNumber)
      });

      const { data: comments } = await client.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: parseInt(prNumber)
      });

      const prDetails = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        author: {
          login: pr.user.login,
          name: pr.user.name || pr.user.login,
          email: pr.user.email,
          avatar: pr.user.avatar_url
        },
        assignees: pr.assignees.map(user => ({
          login: user.login,
          name: user.name || user.login,
          email: user.email
        })),
        requestedReviewers: pr.requested_reviewers.map(user => ({
          login: user.login,
          name: user.name || user.login,
          email: user.email
        })),
        labels: pr.labels.map(label => label.name),
        milestone: pr.milestone ? pr.milestone.title : null,
        branch: {
          source: pr.head.ref,
          target: pr.base.ref
        },
        urls: {
          html: pr.html_url,
          api: pr.url,
          diff: pr.diff_url,
          patch: pr.patch_url
        },
        stats: {
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files
        },
        files: files.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes
        })),
        reviews: reviews.map(review => ({
          id: review.id,
          state: review.state,
          reviewer: {
            login: review.user.login,
            name: review.user.name || review.user.login
          },
          body: review.body,
          submittedAt: review.submitted_at
        })),
        commentsCount: comments.length,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at,
        closedAt: pr.closed_at
      };

      logger.info('Pull request details retrieved', {
        requestId,
        repository,
        prNumber,
        title: pr.title,
        author: pr.user.login,
        reviewersCount: prDetails.requestedReviewers.length,
        executionTime: timer.end()
      });

      return prDetails;

    } catch (error) {
      timer.end();
      
      if (error.status === 404) {
        throw new Error(`Pull request #${prNumber} not found in ${repository}`);
      }
      
      if (error.status === 403) {
        throw new Error(`Access denied to ${repository}. Please check your GitHub permissions.`);
      }
      
      logger.error('Failed to fetch pull request', {
        requestId,
        repository,
        prNumber,
        error: error.message
      });
      
      throw new Error(`GitHub API error: ${error.message}`);
    }
  }

  /**
   * Create mock PR data for demos and testing
   * @private
   */
  _createMockPrData(repository, prNumber) {
    const [owner, repo] = repository.split('/');
    const mockPrData = {
      number: parseInt(prNumber),
      title: `Demo PR: Add new feature for ${repo}`,
      body: "This is a demo pull request for testing the WorkflowGenie MCP server.",
      state: "open",
      html_url: `https://github.com/${repository}/pull/${prNumber}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: {
        login: "demo-user",
        name: "Demo User",
        email: "demo@example.com",
        avatar: "https://github.com/identicons/demo-user.png"
      },
      assignees: [
        {
          login: "reviewer1",
          name: "Reviewer One",
          email: "reviewer1@example.com"
        }
      ],
      requestedReviewers: [
        {
          login: "reviewer2",
          name: "Reviewer Two",
          email: "reviewer2@example.com"
        }
      ],
      labels: ["feature", "needs-review"],
      milestone: "Q3 Release",
      stats: {
        changedFiles: 5,
        additions: 150,
        deletions: 30,
        commits: 3
      },
      files: [
        {
          filename: "src/main.js",
          status: "modified",
          additions: 50,
          deletions: 10
        },
        {
          filename: "src/components/Feature.js",
          status: "added",
          additions: 100,
          deletions: 0
        },
        {
          filename: "test/feature.test.js",
          status: "added",
          additions: 0,
          deletions: 20
        }
      ],
      reviews: [],
      comments: [],
      branch: `feature-branch-${prNumber}`,
      url: `https://github.com/${repository}/pull/${prNumber}`
    };
    
    logger.debug('Created mock PR data for demo', { repository, prNumber });
    return mockPrData;
  }

  async getRepository(repository, userToken, requestId) {
    const timer = createPerformanceTimer('github_get_repository');
    
    try {
      const [owner, repo] = repository.split('/');
      const client = this.getClient(userToken);
      
      logger.debug('Fetching repository details', { requestId, repository });

      const { data: repoData } = await client.rest.repos.get({
        owner,
        repo
      });

      const { data: commits } = await client.rest.repos.listCommits({
        owner,
        repo,
        per_page: 10
      });

      const { data: contributors } = await client.rest.repos.listContributors({
        owner,
        repo,
        per_page: 20
      });

      const repositoryInfo = {
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description,
        private: repoData.private,
        owner: {
          login: repoData.owner.login,
          type: repoData.owner.type
        },
        urls: {
          html: repoData.html_url,
          clone: repoData.clone_url,
          ssh: repoData.ssh_url
        },
        defaultBranch: repoData.default_branch,
        language: repoData.language,
        topics: repoData.topics || [],
        stats: {
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          watchers: repoData.watchers_count,
          openIssues: repoData.open_issues_count,
          size: repoData.size
        },
        recentCommits: commits.slice(0, 5).map(commit => ({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0],
          author: commit.commit.author.name,
          date: commit.commit.author.date
        })),
        contributors: contributors.slice(0, 10).map(contributor => ({
          login: contributor.login,
          contributions: contributor.contributions
        })),
        createdAt: repoData.created_at,
        updatedAt: repoData.updated_at
      };

      logger.info('Repository details retrieved', {
        requestId,
        repository,
        language: repoData.language,
        stars: repoData.stargazers_count,
        executionTime: timer.end()
      });

      return repositoryInfo;

    } catch (error) {
      timer.end();
      
      if (error.status === 404) {
        throw new Error(`Repository ${repository} not found or not accessible`);
      }
      
      logger.error('Failed to fetch repository', {
        requestId,
        repository,
        error: error.message
      });
      
      throw new Error(`GitHub API error: ${error.message}`);
    }
  }

  async getSuggestedReviewers(repository, prNumber, userToken, requestId) {
    try {
      const [owner, repo] = repository.split('/');
      const client = this.getClient(userToken);
      
      const prDetails = await this.getPullRequest(repository, prNumber, userToken, requestId);
      
      const { data: contributors } = await client.rest.repos.listContributors({
        owner,
        repo,
        per_page: 50
      });

      const changedFiles = prDetails.files.map(f => f.filename);
      
      const suggestedReviewers = [];
      
      for (const file of changedFiles.slice(0, 5)) {
        try {
          const { data: commits } = await client.rest.repos.listCommits({
            owner,
            repo,
            path: file,
            per_page: 10
          });
          
          commits.forEach(commit => {
            const author = commit.author;
            if (author && author.login !== prDetails.author.login) {
              const existing = suggestedReviewers.find(r => r.login === author.login);
              if (existing) {
                existing.relevance += 1;
              } else {
                suggestedReviewers.push({
                  login: author.login,
                  name: author.name || author.login,
                  avatar: author.avatar_url,
                  relevance: 1,
                  reason: `Recently worked on ${file}`
                });
              }
            }
          });
        } catch (error) {
          logger.debug('Could not analyze commits for file', { file });
        }
      }

      const sortedSuggestions = suggestedReviewers
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);

      if (sortedSuggestions.length < 3) {
        contributors.slice(0, 3).forEach(contributor => {
          if (contributor.login !== prDetails.author.login && 
              !sortedSuggestions.find(s => s.login === contributor.login)) {
            sortedSuggestions.push({
              login: contributor.login,
              name: contributor.login,
              avatar: contributor.avatar_url,
              relevance: 0,
              reason: `Top contributor (${contributor.contributions} commits)`
            });
          }
        });
      }

      logger.info('Suggested reviewers identified', {
        requestId,
        repository,
        prNumber,
        suggestedCount: sortedSuggestions.length
      });

      return sortedSuggestions.slice(0, 5);

    } catch (error) {
      logger.error('Failed to get suggested reviewers', {
        requestId,
        repository,
        prNumber,
        error: error.message
      });
      
      return [];
    }
  }

  async createIssue(repository, issueData, userToken, requestId) {
    const timer = createPerformanceTimer('github_create_issue');
    
    try {
      const [owner, repo] = repository.split('/');
      const client = this.getClient(userToken);
      
      logger.debug('Creating GitHub issue', {
        requestId,
        repository,
        title: issueData.title
      });

      const { data: issue } = await client.rest.issues.create({
        owner,
        repo,
        title: issueData.title,
        body: issueData.body || '',
        labels: issueData.labels || [],
        assignees: issueData.assignees || [],
        milestone: issueData.milestone || null
      });

      logger.info('GitHub issue created', {
        requestId,
        repository,
        issueNumber: issue.number,
        title: issue.title,
        executionTime: timer.end()
      });

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        url: issue.html_url,
        state: issue.state,
        author: issue.user.login,
        assignees: issue.assignees.map(a => a.login),
        labels: issue.labels.map(l => l.name),
        createdAt: issue.created_at
      };

    } catch (error) {
      timer.end();
      
      logger.error('Failed to create GitHub issue', {
        requestId,
        repository,
        error: error.message
      });
      
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  async addComment(repository, issueNumber, comment, userToken, requestId) {
    try {
      const [owner, repo] = repository.split('/');
      const client = this.getClient(userToken);
      
      logger.debug('Adding comment to issue/PR', {
        requestId,
        repository,
        issueNumber
      });

      const { data: commentData } = await client.rest.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(issueNumber),
        body: comment
      });

      logger.info('Comment added successfully', {
        requestId,
        repository,
        issueNumber,
        commentId: commentData.id
      });

      return {
        id: commentData.id,
        body: commentData.body,
        url: commentData.html_url,
        author: commentData.user.login,
        createdAt: commentData.created_at
      };

    } catch (error) {
      logger.error('Failed to add comment', {
        requestId,
        repository,
        issueNumber,
        error: error.message
      });
      
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }

  async getCurrentUser(userToken) {
    try {
      const client = this.getClient(userToken);
      const { data: user } = await client.rest.users.getAuthenticated();
      
      return {
        login: user.login,
        name: user.name || user.login,
        email: user.email,
        avatar: user.avatar_url,
        company: user.company,
        location: user.location,
        bio: user.bio
      };
      
    } catch (error) {
      logger.error('Failed to get current user', { error: error.message });
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  async searchRepositories(query, userToken, options = {}) {
    try {
      const client = this.getClient(userToken);
      
      const { data } = await client.rest.search.repos({
        q: query,
        sort: options.sort || 'stars',
        order: options.order || 'desc',
        per_page: options.limit || 10
      });

      return data.items.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        url: repo.html_url,
        private: repo.private
      }));

    } catch (error) {
      logger.error('Repository search failed', { query, error: error.message });
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async validateRepositoryAccess(repository, userToken) {
    try {
      const [owner, repo] = repository.split('/');
      const client = this.getClient(userToken);
      
      await client.rest.repos.get({ owner, repo });
      
      try {
        const { data: permissions } = await client.rest.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username: (await this.getCurrentUser(userToken)).login
        });
        
        return {
          hasAccess: true,
          canRead: true,
          canWrite: ['write', 'admin'].includes(permissions.permission),
          canAdmin: permissions.permission === 'admin',
          permission: permissions.permission
        };
      } catch {
        return {
          hasAccess: true,
          canRead: true,
          canWrite: false,
          canAdmin: false,
          permission: 'read'
        };
      }
      
    } catch (error) {
      if (error.status === 404) {
        return {
          hasAccess: false,
          canRead: false,
          canWrite: false,
          canAdmin: false,
          error: 'Repository not found or no access'
        };
      }
      
      throw error;
    }
  }

  async cleanup() {
    logger.info('Cleaning up GitHub connector...');
    this.clients.clear();
    logger.info('GitHub cleanup complete');
  }
}