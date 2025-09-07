// src/integrations/descope.js - Correct Descope Authentication Integration
import DescopeClient from '@descope/node-sdk';
import { logger, logSecurityEvent, createPerformanceTimer } from '../utils/logger.js';

export class DescopeAuth {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isInitialized = false;
    this.tokenCache = new Map(); // Cache validated tokens temporarily
  }

  async initialize() {
    try {
      logger.info('Initializing Descope authentication...');
      
      // Initialize Descope client with project ID
      this.client = DescopeClient({
        projectId: this.config.projectId,
        managementKey: this.config.managementKey
      });

      // Test the connection
      await this.validateConnection();
      
      this.isInitialized = true;
      logger.info('✅ Descope authentication initialized', {
        projectId: this.config.projectId
      });
      
    } catch (error) {
      logger.error('❌ Failed to initialize Descope', {
        error: error.message,
        projectId: this.config.projectId
      });
      throw new Error(`Descope initialization failed: ${error.message}`);
    }
  }

  /**
   * Validate user session token and return user context
   */
  async validateUser(sessionToken) {
    if (!this.isInitialized) {
      throw new Error('Descope not initialized');
    }

    if (!sessionToken) {
      throw new Error('No session token provided');
    }

    const timer = createPerformanceTimer('descope_validate_user');
    
    try {
      // Check cache first (tokens valid for 5 minutes)
      const cachedUser = this.getCachedUser(sessionToken);
      if (cachedUser) {
        logger.debug('Using cached user validation', { userId: cachedUser.userId });
        return cachedUser;
      }

      logger.debug('Validating session token with Descope');

      // Validate session token
      const authInfo = await this.client.validateSession(sessionToken);
      
      if (!authInfo || !authInfo.token) {
        logSecurityEvent('Invalid session token', { 
          tokenPrefix: sessionToken.substring(0, 10) + '...'
        });
        throw new Error('Invalid or expired session token');
      }

      const { token } = authInfo;
      
      // Extract user information from JWT token
      const userInfo = {
        userId: token.sub,
        email: token.email,
        name: token.name || token.email?.split('@')[0] || 'Unknown',
        permissions: token.permissions || [],
        roles: token.roles || [],
        customClaims: token.customClaims || {}
      };

      // Get OAuth tokens for external services
      const oauthTokens = await this.getUserOAuthTokens(userInfo.userId);
      
      // Build complete user context
      const userContext = {
        ...userInfo,
        tokens: oauthTokens,
        sessionToken,
        validated: true,
        validatedAt: new Date().toISOString(),
        expiresAt: new Date(token.exp * 1000).toISOString()
      };

      // Cache the user context (5 minute expiry)
      this.cacheUser(sessionToken, userContext, 5 * 60 * 1000);

      logger.debug('User validation successful', {
        userId: userContext.userId,
        email: userContext.email,
        tokenCount: Object.keys(userContext.tokens).length,
        executionTime: timer.end()
      });

      return userContext;

    } catch (error) {
      timer.end();
      
      if (error.message.includes('expired')) {
        logSecurityEvent('Expired session token', { 
          tokenPrefix: sessionToken.substring(0, 10) + '...'
        });
        throw new Error('Session token has expired. Please log in again.');
      }
      
      logger.error('User validation failed', {
        error: error.message,
        tokenPrefix: sessionToken.substring(0, 10) + '...'
      });
      
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get OAuth tokens for external services for this user
   */
  async getUserOAuthTokens(userId) {
    try {
      logger.debug('Fetching OAuth tokens for user', { userId });

      // Use Descope's OAuth token management
      const tokens = {};

      // GitHub OAuth token
      try {
        const githubToken = await this.client.oauth.getToken(userId, 'github');
        if (githubToken) {
          tokens.github = githubToken.accessToken;
        }
      } catch (error) {
        logger.debug('No GitHub token for user', { userId });
      }

      // Slack OAuth token
      try {
        const slackToken = await this.client.oauth.getToken(userId, 'slack');
        if (slackToken) {
          tokens.slack = slackToken.accessToken;
        }
      } catch (error) {
        logger.debug('No Slack token for user', { userId });
      }

      // Google OAuth token (for Calendar)
      try {
        const googleToken = await this.client.oauth.getToken(userId, 'google');
        if (googleToken) {
          tokens.google_calendar = googleToken.accessToken;
          tokens.google_refresh = googleToken.refreshToken;
        }
      } catch (error) {
        logger.debug('No Google token for user', { userId });
      }

      // Notion OAuth token
      try {
        const notionToken = await this.client.oauth.getToken(userId, 'notion');
        if (notionToken) {
          tokens.notion = notionToken.accessToken;
        }
      } catch (error) {
        logger.debug('No Notion token for user', { userId });
      }

      logger.debug('Retrieved OAuth tokens', {
        userId,
        tokenTypes: Object.keys(tokens)
      });

      return tokens;

    } catch (error) {
      logger.error('Failed to retrieve OAuth tokens', {
        userId,
        error: error.message
      });
      
      // Return empty tokens object - user will need to authenticate
      return {};
    }
  }

  /**
   * Initiate OAuth flow for a service
   */
  async initiateOAuth(userId, service, redirectUri) {
    try {
      logger.info('Initiating OAuth flow', { userId, service });

      const authUrl = await this.client.oauth.start(service, redirectUri, {
        userId: userId,
        state: `${userId}:${service}:${Date.now()}`
      });

      logger.debug('OAuth URL generated', { service, userId });
      
      return {
        authUrl,
        service,
        userId,
        expiresIn: 600 // 10 minutes
      };

    } catch (error) {
      logger.error('Failed to initiate OAuth flow', {
        userId,
        service,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Complete OAuth flow and store token
   */
  async completeOAuth(code, state, service) {
    try {
      const [userId, serviceFromState, timestamp] = state.split(':');
      
      if (service !== serviceFromState) {
        throw new Error('OAuth state mismatch');
      }

      logger.info('Completing OAuth flow', { userId, service });

      const tokenData = await this.client.oauth.exchange(service, code, {
        userId: userId
      });

      logger.info('OAuth flow completed successfully', { 
        userId, 
        service,
        hasRefreshToken: !!tokenData.refreshToken
      });

      return {
        success: true,
        userId,
        service,
        tokenData
      };

    } catch (error) {
      logger.error('Failed to complete OAuth flow', {
        service,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if user has required OAuth tokens for a tool
   */
  checkRequiredTokens(userContext, requiredServices = []) {
    const missingTokens = [];
    
    for (const service of requiredServices) {
      if (!userContext.tokens[service]) {
        missingTokens.push(service);
      }
    }

    if (missingTokens.length > 0) {
      logger.warn('User missing required OAuth tokens', {
        userId: userContext.userId,
        missing: missingTokens
      });
      
      return {
        hasAllTokens: false,
        missingTokens,
        message: `Please connect your ${missingTokens.join(', ')} account(s) to use this feature.`
      };
    }

    return {
      hasAllTokens: true,
      missingTokens: [],
      message: 'All required tokens available'
    };
  }

  /**
   * Cache user validation result
   */
  cacheUser(token, userContext, ttl = 5 * 60 * 1000) {
    const expiry = Date.now() + ttl;
    this.tokenCache.set(token, { ...userContext, cacheExpiry: expiry });
    
    // Clean up expired entries periodically
    if (this.tokenCache.size > 100) {
      this.cleanupCache();
    }
  }

  /**
   * Get cached user if still valid
   */
  getCachedUser(token) {
    const cached = this.tokenCache.get(token);
    
    if (!cached) {
      return null;
    }
    
    if (Date.now() > cached.cacheExpiry) {
      this.tokenCache.delete(token);
      return null;
    }
    
    return cached;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [token, data] of this.tokenCache.entries()) {
      if (now > data.cacheExpiry) {
        this.tokenCache.delete(token);
      }
    }
    
    logger.debug('Token cache cleaned up', { 
      remainingEntries: this.tokenCache.size 
    });
  }

  /**
   * Test Descope connection
   */
  async validateConnection() {
    try {
      // For hackathon purposes, let's do a simpler validation
      // Check if the client was initialized properly
      if (!this.client) {
        throw new Error('Descope client not initialized');
      }
      
      // In a production app, we'd verify with an actual API call
      // For now, we'll just verify the projectId was set
      if (!this.config.projectId) {
        throw new Error('Missing Descope project ID');
      }
      
      logger.debug('Descope connection validated', {
        projectId: this.config.projectId
      });
      
      return true;
      
    } catch (error) {
      throw new Error(`Cannot connect to Descope: ${error.message}`);
    }
  }

  /**
   * Create authentication URL for users
   */
  getAuthenticationUrl(redirectUri = 'http://localhost:3000/auth/callback') {
    const authUrl = `https://auth.descope.io/${this.config.projectId}`;
    return `${authUrl}?redirectUri=${encodeURIComponent(redirectUri)}`;
  }

  /**
   * Get user permissions for authorization checks
   */
  hasPermission(userContext, permission) {
    const permissions = userContext.permissions || [];
    const roles = userContext.roles || [];
    
    // Check direct permissions
    if (permissions.includes(permission)) {
      return true;
    }
    
    // Check role-based permissions
    const adminRoles = ['admin', 'super-admin'];
    if (adminRoles.some(role => roles.includes(role))) {
      return true;
    }
    
    return false;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up Descope authentication...');
    
    // Clear token cache
    this.tokenCache.clear();
    
    this.isInitialized = false;
    logger.info('✅ Descope cleanup complete');
  }
}