#!/bin/bash

# Export source code for Firefox Add-on submission
# This creates a clean zip with only source files needed for review

set -e

# Get current version from package.json
VERSION=$(node -p "require('./package.json').version")
OUTPUT_FILE="ai-prompts-source-v${VERSION}.zip"

echo "Exporting source code for AI Prompts v${VERSION}..."

# Create temporary directory
TEMP_DIR=$(mktemp -d)
EXPORT_DIR="${TEMP_DIR}/ai-prompts-source"

# Create export directory
mkdir -p "${EXPORT_DIR}"

# Copy source files
echo "Copying source files..."
cp -r src/ "${EXPORT_DIR}/"
cp package.json "${EXPORT_DIR}/"
cp package-lock.json "${EXPORT_DIR}/"
cp tsconfig.json "${EXPORT_DIR}/"
cp tsup.config.ts "${EXPORT_DIR}/"
cp BUILD_README.md "${EXPORT_DIR}/"
cp README.md "${EXPORT_DIR}/"
cp LICENSE "${EXPORT_DIR}/"

# Copy bin/ if it exists (for build scripts)
if [ -d "bin/" ]; then
    cp -r bin/ "${EXPORT_DIR}/"
fi

# Create .gitignore for the export to show what should be ignored
cat > "${EXPORT_DIR}/.gitignore" << 'EOF'
# Build output
dist/
node_modules/

# Development
.DS_Store
*.log
.env

# IDE
.vscode/
.idea/
EOF

# Create the zip file
echo "Creating zip file: ${OUTPUT_FILE}"
cd "${TEMP_DIR}"
zip -r "${OUTPUT_FILE}" ai-prompts-source/

# Move zip to original directory
mv "${OUTPUT_FILE}" "${OLDPWD}/"

# Cleanup
rm -rf "${TEMP_DIR}"

echo "✅ Source code exported to: ${OUTPUT_FILE}"
echo ""
echo "📋 Submit this zip file to Mozilla with these details:"
echo "   • Build command: FIREFOX=1 npm run build"
echo "   • Node.js requirement: v18+"
echo "   • See BUILD_README.md for complete instructions"
echo ""
echo "🔍 Zip contents:"
unzip -l "${OUTPUT_FILE}"
