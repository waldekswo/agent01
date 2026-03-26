# mcp-http

Safe HTTP client for MCP with allowlist validation.

## Usage

POST /http/request
{
  "method": "GET",
  "url": "https://api.example.com/data",
  "headers": {"Authorization": "Bearer token"},
  "timeout": 30000
}
