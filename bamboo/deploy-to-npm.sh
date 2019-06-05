#!/bin/bash
set -e
. ./bamboo/set-bamboo-env-variables.sh

if [[ ! $PUBLISH_FLAG == true ]]; then
  echo "******Skipping publish step as PUBLISH_FLAG is not set"
  exit 0
fi

export VERSION=$(jq --raw-output .version lerna.json)
export NPM_TAG=$(node ./bamboo/npm-tag.js);

echo "Publishing packages to NPM with version=${VERSION} and tag=${NPM_TAG}"
lerna publish \
  ${VERSION} \
  --no-git-tag-version \
  --no-push \
  --yes \
  --force-publish=* \
  --dist-tag=${NPM_TAG} \
  --exact

