# mcp-graph

Microsoft Graph email service for OpenClaw Agent. Manages email drafts and sending with approval workflow.

## Quick Start

### Development

```bash
npm install
npm run dev
```

### API Endpoints

#### Draft Email
```bash
POST /graph/email/draft
{
  "userId": "user123",
  "to": ["adam@company.com"],
  "cc": ["boss@company.com"],
  "subject": "Project Update",
  "body": "Here's the update...",
  "attachments": []
}
```

#### Send Email (REQUIRES isApprovedAction = true)
```bash
POST /graph/email/send
{
  "draftId": "uuid-xxx",
  "isApprovedAction": true,
  "comment": "Sent by agent"
}
```

#### Get Draft
```bash
GET /graph/email/draft/{draftId}
```

#### Delete Draft
```bash
DELETE /graph/email/draft/{draftId}
```

## Security

**CRITICAL:** Never send email without `isApprovedAction=true`. This ensures human approval.

## TODO

- [ ] Integrate with Microsoft Graph API v5
- [ ] Attachments support (inline images)
- [ ] Distribution lists
- [ ] Retry logic + rate limiting
- [ ] Carbon copy tracking
