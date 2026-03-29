# Adapter: Telegram

Telegram webhook adapter for Malgosha Agent. Converts Telegram messages to UMS format.

## Setup

1. Create bot with BotFather: `/newbot`
2. Get token from BotFather
3. Set env vars:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `PUBLIC_BASE_URL` = https://your-domain.com

4. Set webhook:
   ```bash
   curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-domain/webhook/telegram"}'
   ```

## Message Flow

1. User sends message to bot
2. Telegram sends POST to /webhook/telegram
3. Adapter converts to UMS format
4. UMS sent to Foundry Agent
5. Agent processes and responds
6. Response sent back to Telegram

## Approval Flow

For approval (e.g., email sending):
```
Agent sends: "Approve sending email?" + inline keyboard
User clicks "Approve"
callback_query triggers UMS with isApprovedAction=true
Agent receives approval and proceeds
```
