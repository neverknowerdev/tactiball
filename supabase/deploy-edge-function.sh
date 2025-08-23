#!/bin/bash

# Deploy Supabase Edge Function for Contract Events
# This script deploys the contract-events function to Supabase

set -e

echo "🚀 Deploying Supabase Edge Function: event-router"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "supabase/functions/event-router/index.ts" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Check if supabase project is linked
if ! supabase status &> /dev/null; then
    echo "❌ No Supabase project linked. Please link your project first:"
    echo "   supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
fi

echo "📦 Building and deploying function..."

# Deploy the function
supabase functions deploy event-router

echo "✅ Function deployed successfully!"

echo ""
echo "🔗 Function URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/contract-events"
echo ""
echo "📋 Next steps:"
echo "1. Set environment variables in Supabase dashboard:"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "2. Run database migrations:"
echo "   ./migrations/run-migrations.sh"
echo "3. Configure your webhook to point to the function URL"
echo "4. Test the function with sample event data"
echo ""
echo "📚 For more information, see: supabase/functions/event-router/README.md"
