import { WorkflowOrchestrator } from '../src/services/orchestrator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCodeReviewWorkflow() {
  console.log('=== 🔄 Testing Complete Code Review Workflow ===');
  console.log('GitHub PR → Slack Channel → Google Calendar → Notion');
  console.log('=============================================\n');

  const githubToken = process.env.GITHUB_TEST_TOKEN;
  const slackToken = process.env.SLACK_TEST_TOKEN;
  const calendarToken = process.env.GOOGLE_CALENDAR_TEST_TOKEN;
  const notionToken = process.env.NOTION_TEST_TOKEN;

  console.log('Checking environment variables...');
  console.log(`GitHub Token: ${githubToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`Slack Token: ${slackToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`Calendar Token: ${calendarToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`Notion Token: ${notionToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`Notion Database ID: ${process.env.NOTION_DEFAULT_DATABASE_ID ? '✅ Found' : '❌ Missing'}\n`);

  if (!githubToken || !slackToken || !calendarToken || !notionToken) {
    console.log('❌ Please add all required tokens to your .env file');
    return;
  }

  // Create mock user context with all required tokens
  const userContext = {
    userId: 'test-user-123',
    githubToken,
    slackToken,
    calendarToken,
    notionToken
  };

  try {
    console.log('Step 1: Initializing WorkflowOrchestrator...');
    const orchestrator = new WorkflowOrchestrator();
    await orchestrator.initialize();
    console.log('✅ Orchestrator initialized successfully');

    console.log('\nStep 2: Testing code review workflow with all integrations...');
    
    const repository = process.env.TEST_REPO || 'facebook/react';
    const prNumber = process.env.TEST_PR || '1000';
    const urgency = process.env.TEST_URGENCY || 'medium';
    
    console.log(`Using PR #${prNumber} from ${repository} with ${urgency} urgency`);
    
    // Execute the complete workflow
    const result = await orchestrator.scheduleCodeReview(
      {
        repository,
        pr_number: prNumber,
        urgency
      },
      userContext,
      'test-request-001'
    );

    if (result.success) {
      console.log('\n✅ Code review workflow completed successfully!');
      console.log(`Execution time: ${result.executionTime}`);
      console.log('\nWorkflow Results:');
      console.log('----------------');
      console.log(`GitHub PR: ${result.details.github_pr}`);
      console.log(`Slack Channel: ${result.details.slack_channel}`);
      console.log(`Calendar Meeting: ${result.details.meeting.title}`);
      console.log(`Meeting Time: ${new Date(result.details.meeting.time).toLocaleString()}`);
      console.log(`Meeting Duration: ${result.details.meeting.duration}`);
      console.log(`Video Call: ${result.details.meeting.videoCall}`);
      
      if (result.details.notion) {
        console.log(`Notion Page: ${result.details.notion.url}`);
      } else {
        console.log('Notion Page: Not created');
      }
    } else {
      console.log('\n❌ Code review workflow failed');
      console.log(`Error: ${result.message}`);
    }

    // Clean up
    await orchestrator.cleanup();

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// If run directly (not imported)

testCodeReviewWorkflow();

