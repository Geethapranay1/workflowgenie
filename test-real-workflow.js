// A test script to try the real PR workflow using the MCP server
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';


dotenv.config();


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


async function promptUser() {
  return new Promise((resolve) => {
    console.log("\n=== WorkflowGenie MCP Real PR Test ===\n");
    
    // Default values
    const defaults = {
      repo: process.env.TEST_REPO || 'facebook/react',
      prNumber: process.env.TEST_PR || '1000',
      urgency: process.env.TEST_URGENCY || 'medium'
    };
    
    console.log("Please provide the following information (or press Enter for defaults):");
    
    rl.question(`GitHub repository (default: ${defaults.repo}): `, (repo) => {
      repo = repo || defaults.repo;
      
      rl.question(`PR number (default: ${defaults.prNumber}): `, (prNumber) => {
        prNumber = prNumber || defaults.prNumber;
        
        rl.question(`Urgency [low/medium/high] (default: ${defaults.urgency}): `, (urgency) => {
          urgency = urgency || defaults.urgency;
          
          // Validate urgency
          if (!['low', 'medium', 'high'].includes(urgency)) {
            console.log("Invalid urgency. Using 'medium' as default.");
            urgency = 'medium';
          }
          
          // Close readline interface
          rl.close();
          
          // Return collected input
          resolve({
            repository: repo,
            pr_number: prNumber,
            urgency: urgency
          });
        });
      });
    });
  });
}

// Check if GitHub token exists in .env
async function checkTokens() {
  try {
    if (!process.env.GITHUB_TEST_TOKEN) {
      console.log("\n⚠️ No GitHub token found in .env file!");
      console.log("For a real-world test with actual GitHub data, you should add your token.");
      console.log("Add this to your .env file:");
      console.log("GITHUB_TEST_TOKEN=your_github_token_here\n");
    } else {
      console.log("\n✅ GitHub token found in .env file");
    }
    
    if (!process.env.SLACK_TEST_TOKEN) {
      console.log("\n⚠️ No Slack token found in .env file!");
    } else {
      console.log("✅ Slack token found in .env file");
    }
    
    console.log("\nNote: For a fully functional demo, tokens for GitHub, Slack, Google Calendar, and Notion are recommended.\n");
  } catch (error) {
    console.error("Error checking tokens:", error);
  }
}

async function main() {
  try {
    // Check if GitHub token exists
    await checkTokens();
    
    // Get user input
    const args = await promptUser();
    
    console.log("\nSending tool call to MCP server...");
    console.log(`Repository: ${args.repository}`);
    console.log(`PR Number: ${args.pr_number}`);
    console.log(`Urgency: ${args.urgency}`);
    
    // Configure port based on environment
    const port = process.env.PORT || 3001;
    
    // Optional: Add any GitHub token from .env to the request
    const userToken = process.env.GITHUB_TEST_TOKEN || null;
    
    // Prepare the request payload
    const payload = {
      name: "schedule_code_review",
      arguments: args,
      meta: userToken ? { userToken } : {}
    };
    
    console.log("\nSending request to MCP server...");
    
    // Make the request to the MCP server
    const response = await fetch(`http://localhost:${port}/v1/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Parse and display the response
    const result = await response.json();
    console.log("\n=== MCP Server Response ===");
    console.log(JSON.stringify(result, null, 2));
    
    if (result.content && result.content.length > 0) {
      console.log("\n=== Formatted Response ===");
      console.log(result.content[0].text);
    }
    
    console.log("\nTest completed successfully!");
    
  } catch (error) {
    console.error("\nError during test:", error);
  }
}

main();
