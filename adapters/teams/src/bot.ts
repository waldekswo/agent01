import {
  TeamsActivityHandler,
  ConversationState,
  UserState,
  TurnContext,
  CardFactory,
} from 'botbuilder';
import { logger } from './logger';
import { messageToUMS, buttonActionToUMS } from './ums-mapper';
import { chat } from './agent-client';

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
      const membersAdded = context.activity.membersAdded ?? [];
      const recipientId = context.activity.recipient?.id;

      for (const member of membersAdded) {
        if (member.id !== recipientId) {
          await context.sendActivity(`Cześć! Jestem Malgosha. Jak mogę pomóc?`);
        }
      }
      await next();
    });
  }

  private async handleMessage(context: TurnContext) {
    try {
      const text = context.activity.text?.trim();
      const value = context.activity.value as string | undefined;

      // Adaptive Card Action.Submit (approval button click)
      if (!text && value) {
        await this.handleApproval(context, String(value));
        return;
      }

      if (!text) return;

      const ums = messageToUMS(context.activity);
      logger.info({ ums }, 'Teams message received');

      // Send typing indicator
      await context.sendActivity({ type: 'typing' });

      const userId = `teams:${context.activity.from.id}`;
      const response = await chat(userId, text);

      if (response.pendingDraftId) {
        // Agent created an email draft — send Adaptive Card with Approve / Reject
        const card = CardFactory.adaptiveCard({
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: response.text,
              wrap: true,
            },
          ],
          actions: [
            {
              type: 'Action.Submit',
              title: '✅ Wyślij email',
              data: `${response.pendingDraftId}:approve`,
              style: 'positive',
            },
            {
              type: 'Action.Submit',
              title: '❌ Anuluj',
              data: `${response.pendingDraftId}:reject`,
              style: 'destructive',
            },
          ],
        });
        await context.sendActivity({ attachments: [card] });
      } else {
        await context.sendActivity(response.text);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to handle message');
      await context.sendActivity('⚠️ Wystąpił błąd. Spróbuj ponownie.');
    }
  }

  private async handleApproval(context: TurnContext, action: string) {
    try {
      const ums = buttonActionToUMS(context.activity);
      logger.info({ ums, action }, 'Approval action received');

      const userId = `teams:${context.activity.from.id}`;
      const [draftId, actionType] = action.split(':');

      const systemMsg =
        actionType === 'approve'
          ? `[SYSTEM] Użytkownik zatwierdził wysłanie maila. draftId=${draftId} isApprovedAction=true. Wywołaj teraz graph_send_email.`
          : `[SYSTEM] Użytkownik odrzucił wysłanie maila. draftId=${draftId}. Anuluj draft i poinformuj użytkownika.`;

      const response = await chat(userId, systemMsg);
      await context.sendActivity(response.text);
    } catch (error) {
      logger.error({ error }, 'Failed to handle approval');
      await context.sendActivity('⚠️ Błąd podczas przetwarzania decyzji. Spróbuj ponownie.');
    }
  }

  async run(context: TurnContext): Promise<void> {
    await super.run(context);
    await this.conversationState.saveChanges(context, false);
    await this.userState.saveChanges(context, false);
  }
}
