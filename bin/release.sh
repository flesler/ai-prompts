#!/bin/bash
set -e

VERSION_TYPE="$1"
if [ -z "$VERSION_TYPE" ] || [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 <patch|minor|major>"
    exit 1
fi

npm version "$VERSION_TYPE" --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
TAG_NAME="v$NEW_VERSION"

git add package.json package-lock.json
git commit -m "$TAG_NAME"
git tag -d "$TAG_NAME" 2>/dev/null || true
git tag "$TAG_NAME" -m "$TAG_NAME"

echo "✅ Successfully created version $NEW_VERSION"
