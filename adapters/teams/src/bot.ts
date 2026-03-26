import { TeamsActivityHandler, ConversationState, UserState, TurnContext } from 'botbuilder';
import { logger } from './logger';
import { messageToUMS } from './ums-mapper';

export class TeamsBot extends TeamsActivityHandler {
  private conversationState: ConversationState;
  private userState: UserState;

  constructor(conversationState: ConversationState, userState: UserState) {
    super();
    this.conversationState = conversationState;
    this.userState = userState;

    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(`Welcome! I'm OpenClaw Agent.`);
        }
      }
      await next();
    });
  }

  private async handleMessage(context: TurnContext) {
    try {
      const text = context.activity.text?.trim();
      if (!text) return;

      const ums = messageToUMS(context.activity);
      logger.info({ ums }, 'Teams message received');

      // TODO: Send to Foundry Agent
      // const response = await fetch(AGENT_ENDPOINT, {post: ums})

      await context.sendActivity(`Received: ${text}`);
    } catch (error) {
      logger.error({ error }, 'Failed to handle message');
      await context.sendActivity('Error processing message');
    }
  }

  async run(context: TurnContext): Promise<void> {
    await super.run(context);
    await this.conversationState.saveChanges(context, false);
    await this.userState.saveChanges(context, false);
  }
}
