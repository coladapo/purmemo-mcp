#!/bin/bash
# Enterprise Auto-Organizer - Prevents Directory Mess
# Automatically files new items according to enterprise standards

set -e

ENTERPRISE_ROOT="$(git rev-parse --show-toplevel)"
MAX_ROOT_ITEMS=15

echo "🏢 ENTERPRISE AUTO-ORGANIZER"
echo "============================"
echo ""

cd "$ENTERPRISE_ROOT"

# Count current root items
current_items=$(ls -1 | wc -l | xargs)
echo "📊 Current root items: $current_items (max: $MAX_ROOT_ITEMS)"

if [ "$current_items" -le "$MAX_ROOT_ITEMS" ]; then
    echo "✅ Enterprise compliance maintained"
    exit 0
fi

echo "🚨 COMPLIANCE VIOLATION DETECTED"
echo "⚡ Auto-organizing files..."

# Auto-organize by file patterns
organize_files() {
    # Documentation files
    for file in *.md; do
        if [ -f "$file" ] && [ "$file" != "README.md" ] && [ "$file" != "CLAUDE.md" ] && [ "$file" != "LICENSE" ]; then
            case "$file" in
                *TEST*|*test*) mv "$file" platform/core-services/documentation/testing/ ;;
                *API*|*api*) mv "$file" platform/core-services/documentation/api/ ;;
                *SETUP*|*setup*|*GUIDE*|*guide*) mv "$file" platform/core-services/documentation/guides/ ;;
                *DEPLOY*|*deploy*) mv "$file" platform/core-services/documentation/deployment/ ;;
                *) mv "$file" platform/core-services/documentation/ ;;
            esac
            echo "📄 Moved: $file → documentation/"
        fi
    done

    # Python files
    for file in *.py; do
        if [ -f "$file" ]; then
            case "$file" in
                test_*|*_test.py) mv "$file" platform/core-services/testing/ ;;
                deploy_*|*_deploy.py) mv "$file" platform/core-services/scripts/deployment/ ;;
                setup*|install*) mv "$file" platform/core-services/scripts/utilities/ ;;
                *) mv "$file" platform/core-services/scripts/utilities/ ;;
            esac
            echo "🐍 Moved: $file → scripts/"
        fi
    done

    # JavaScript/Node files  
    for file in *.js; do
        if [ -f "$file" ] && [ "$file" != "package.json" ]; then
            case "$file" in
                test*|*test*) mv "$file" platform/core-services/testing/ ;;
                *) mv "$file" platform/core-services/scripts/utilities/ ;;
            esac
            echo "📦 Moved: $file → scripts/"
        fi
    done

    # Shell scripts
    for file in *.sh; do
        if [ -f "$file" ]; then
            case "$file" in
                deploy*|*deploy*) mv "$file" platform/core-services/scripts/deployment/ ;;
                test*|*test*) mv "$file" platform/core-services/scripts/testing/ ;;
                dev*|*dev*|local*) mv "$file" platform/core-services/scripts/development/ ;;
                build*) mv "$file" platform/core-services/scripts/utilities/ ;;
                start*) mv "$file" platform/core-services/scripts/utilities/ ;;
                *) mv "$file" platform/core-services/scripts/utilities/ ;;
            esac
            echo "⚡ Moved: $file → scripts/"
        fi
    done

    # Configuration files
    for file in *.json *.yaml *.yml *.toml *.ini *.conf; do
        if [ -f "$file" ] && [[ ! "$file" =~ ^(package|package-lock|tsconfig)\.json$ ]] && [ "$file" != "docker-compose.yml" ]; then
            mv "$file" platform/core-services/configuration/
            echo "⚙️ Moved: $file → configuration/"
        fi
    done

    # Environment files (except examples)
    for file in .env.*; do
        if [ -f "$file" ] && [[ ! "$file" =~ \.example$ ]]; then
            mv "$file" platform/core-services/configuration/
            echo "🔧 Moved: $file → configuration/"
        fi
    done

    # Log files
    for file in *.log; do
        if [ -f "$file" ]; then
            mv "$file" platform/core-services/logs/
            echo "📝 Moved: $file → logs/"
        fi
    done

    # Temporary files
    for file in *.tmp *.temp *.bak *.old; do
        if [ -f "$file" ]; then
            mv "$file" platform/core-services/temp/
            echo "🗑️ Moved: $file → temp/"
        fi
    done
}

# Create necessary directories
mkdir -p platform/core-services/{documentation/{api,guides,testing,deployment},scripts/{deployment,testing,development,utilities},configuration,logs,temp,archive}

# Organize files
organize_files

# Final compliance check
final_items=$(ls -1 | wc -l | xargs)
echo ""
echo "📊 Final root items: $final_items"

if [ "$final_items" -le "$MAX_ROOT_ITEMS" ]; then
    echo "✅ Enterprise compliance restored"
else
    echo "⚠️ Still need manual attention for $(($final_items - $MAX_ROOT_ITEMS)) items"
    echo "Remaining items:"
    ls -1 | head -10
fi

echo ""
echo "🏢 Enterprise organization complete!"