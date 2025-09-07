#!/bin/bash
# Deploy WorkflowGenie MCP Server to Smithery.ai

echo "🧞‍♂️ Preparing WorkflowGenie MCP Server for Smithery deployment..."

# Check if smithery CLI is installed
if ! command -v smithery &> /dev/null
then
    echo "❌ Smithery CLI is not installed. Installing..."
    npm install -g @smithery/cli
fi

# Check for Cequence API Key
if [ -z "$CEQUENCE_API_KEY" ]; then
  echo "❌ CEQUENCE_API_KEY environment variable not set"
  echo "Please set it before deploying to Smithery:"
  echo "export CEQUENCE_API_KEY=your_key_here"
  exit 1
fi

# Check for Descope keys
if [ -z "$DESCOPE_PROJECT_ID" ] || [ -z "$DESCOPE_MANAGEMENT_KEY" ]; then
  echo "❌ Descope environment variables not set"
  echo "Please set them before deploying to Smithery:"
  echo "export DESCOPE_PROJECT_ID=your_project_id_here"
  echo "export DESCOPE_MANAGEMENT_KEY=your_key_here"
  exit 1
fi

# Build the project
echo "🔨 Building project..."
npm ci
npm run build

# Deploy to Smithery with environment file
echo "🚀 Deploying to Smithery..."
smithery deploy \
  --name "WorkflowGenie MCP Server" \
  --description "AI-powered workplace orchestration MCP server" \
  --public \
  --env-file smithery.env

echo "✅ Deployment complete! Your MCP server is now available on Smithery."
echo "📝 Don't forget to add your Smithery URL to the README.md file."
