#!/usr/bin/env bash
# =============================================================================
# create-agent.sh — Create or update the Azure OpenAI Assistant (Foundry Agent)
#
# Usage:
#   ./orchestrator/create-agent.sh <oai-endpoint> <api-key>
#
# Outputs:
#   Writes the Agent ID (asst_xxxx) to stdout.
#   All progress messages go to stderr (safe for CI capture).
#
# Requires: curl, jq
# =============================================================================
set -euo pipefail

OAI_ENDPOINT="${1:?'ERROR: OpenAI endpoint is required as first argument'}"
API_KEY="${2:?'ERROR: OpenAI API key is required as second argument'}"

API_VERSION="2024-05-01-preview"
DEFINITION_FILE="orchestrator/agent-definition.json"
AGENT_NAME="OpenClawAgentMVP"

# Ensure endpoint has exactly one trailing slash
OAI_ENDPOINT="${OAI_ENDPOINT%/}/"

BASE_URL="${OAI_ENDPOINT}openai/assistants"

# Verify definition file exists
if [[ ! -f "$DEFINITION_FILE" ]]; then
  >&2 echo "ERROR: Agent definition file not found: $DEFINITION_FILE"
  exit 1
fi

# Validate definition file is valid JSON
if ! jq empty "$DEFINITION_FILE" 2>/dev/null; then
  >&2 echo "ERROR: $DEFINITION_FILE is not valid JSON"
  exit 1
fi

>&2 echo "==> Checking for existing agent '${AGENT_NAME}'..."

# List all assistants (up to 100) and look for one with matching name
LIST_HTTP_CODE=$(curl -s -o /tmp/oai-list.json -w "%{http_code}" \
  -H "api-key: ${API_KEY}" \
  "${BASE_URL}?api-version=${API_VERSION}&limit=100")

if [[ "$LIST_HTTP_CODE" != "200" ]]; then
  >&2 echo "ERROR: Failed to list assistants (HTTP ${LIST_HTTP_CODE})"
  >&2 echo "Response: $(cat /tmp/oai-list.json)"
  exit 1
fi

EXISTING_ID=$(jq -r --arg name "$AGENT_NAME" \
  '.data[] | select(.name == $name) | .id' /tmp/oai-list.json | head -1)

if [[ -n "$EXISTING_ID" && "$EXISTING_ID" != "null" ]]; then
  # ── UPDATE existing agent ──────────────────────────────────────────────────
  >&2 echo "==> Found existing agent (ID: ${EXISTING_ID}) — updating..."

  HTTP_CODE=$(curl -s -o /tmp/oai-response.json -w "%{http_code}" \
    -X POST \
    -H "api-key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d @"$DEFINITION_FILE" \
    "${BASE_URL}/${EXISTING_ID}?api-version=${API_VERSION}")
else
  # ── CREATE new agent ───────────────────────────────────────────────────────
  >&2 echo "==> No existing agent found — creating '${AGENT_NAME}'..."

  HTTP_CODE=$(curl -s -o /tmp/oai-response.json -w "%{http_code}" \
    -X POST \
    -H "api-key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d @"$DEFINITION_FILE" \
    "${BASE_URL}?api-version=${API_VERSION}")
fi

if [[ "$HTTP_CODE" != "200" ]]; then
  >&2 echo "ERROR: Agent API call failed (HTTP ${HTTP_CODE})"
  >&2 echo "Response: $(cat /tmp/oai-response.json)"
  exit 1
fi

AGENT_ID=$(jq -r '.id' /tmp/oai-response.json)

if [[ -z "$AGENT_ID" || "$AGENT_ID" == "null" ]]; then
  >&2 echo "ERROR: Unexpected response — no 'id' field"
  >&2 echo "Response: $(cat /tmp/oai-response.json)"
  exit 1
fi

>&2 echo "==> Agent ready. Name: ${AGENT_NAME}, ID: ${AGENT_ID}"

# Write agent_id to GITHUB_OUTPUT if running in GitHub Actions
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "agent_id=${AGENT_ID}" >> "$GITHUB_OUTPUT"
fi

# Output ID to stdout for capture by caller
echo "$AGENT_ID"
