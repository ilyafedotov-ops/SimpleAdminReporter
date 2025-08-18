#!/bin/bash
# cleanup-artifacts.sh - Clean up build artifacts and temporary files

echo "=== Cleaning up build artifacts ==="

# Remove source maps
echo "Removing source map files..."
find . -name "*.map" -type f -delete 2>/dev/null

# Remove coverage directories
echo "Removing coverage directories..."
find . -name "coverage" -type d -exec rm -rf {} + 2>/dev/null

# Remove build directories
echo "Removing build directories..."
find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null
find . -name "build" -type d -exec rm -rf {} + 2>/dev/null

# Remove TypeScript declaration files from dist
echo "Removing TypeScript declaration files from dist..."
find . -path "*/dist/*.d.ts" -type f -delete 2>/dev/null

# Remove node_modules if requested
if [ "$1" == "--full" ]; then
    echo "Removing node_modules directories (full cleanup)..."
    find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null
fi

# Show disk usage after cleanup
echo ""
echo "=== Disk usage after cleanup ==="
du -sh frontend/build backend/dist 2>/dev/null || echo "No build artifacts found"
du -sh frontend/coverage backend/coverage 2>/dev/null || echo "No coverage reports found"

echo ""
echo "Cleanup completed!"