import { Injectable, effect, inject, signal } from '@angular/core';
import { AiStatusService } from '../core/ai-status.service';
import { VaultService } from '../core/crypto/vault.service';
import { NoticeService } from '../core/notice.service';
import { adapterFor } from './adapters';
import { AiKeysService } from './ai-keys.service';
import { buildMessages, type ContextSnapshot, type StoredMessage } from './context';
import { AIError, type AIErrorKind } from './errors';
import { OFF_TOPIC_REPLY, classifyIntent } from './guardrails';
import { SUMMARY_PROMPT } from './prompts';
import { AllProvidersExhaustedError, route, type RouteEvent } from './router';

export interface ChatItem extends StoredMessage {
  id: string;
  /** App-generated notes (errors, guardrail replies) that are not from a provider. */
  local?: boolean;
}

interface ConversationDoc {
  summary: string | null;
  /** createdAt (ms) of the newest message included in the summary. */
  summarizedThrough: number;
}

const CONV = 'main';
const MESSAGES = ['conversations', CONV, 'messages'];
const PAGE = 50;
const SUMMARIZE_AFTER = 10;

const SWITCH_REASON: Partial<Record<AIErrorKind, string>> = {
  quota_exhausted: 'free quota exhausted',
  rate_limited: 'rate limit reached',
  auth_invalid: 'API key rejected',
  model_unavailable: 'model unavailable',
  provider_down: 'not responding',
};

/**
 * The app-owned conversation. Messages are stored encrypted and every request
 * carries its own context, so any configured provider can continue it.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly vault = inject(VaultService);
  private readonly keys = inject(AiKeysService);
  private readonly status = inject(AiStatusService);
  private readonly notices = inject(NoticeService);

  readonly messages = signal<ChatItem[]>([]);
  readonly loaded = signal(false);
  readonly sending = signal(false);
  private conversation: ConversationDoc = { summary: null, summarizedThrough: 0 };

  constructor() {
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else {
        this.messages.set([]);
        this.loaded.set(false);
      }
    });
  }

  /** Financial context for prompts. Phase 6 fills it from the encrypted profile. */
  snapshot(): ContextSnapshot {
    return { version: 0, data: { currency: 'INR', profile: 'not collected yet' } };
  }

  async load(): Promise<void> {
    try {
      const [rows, conv] = await Promise.all([
        this.vault.list<StoredMessage>(MESSAGES, { orderBy: 'createdAt', direction: 'desc', limit: PAGE }),
        this.vault.get<ConversationDoc>(['conversations', CONV]),
      ]);
      this.conversation = conv ?? { summary: null, summarizedThrough: 0 };
      this.messages.set(rows.reverse().map((r) => ({ ...r.value, id: r.id })));
    } catch {
      // Offline or first use: start empty.
    } finally {
      this.loaded.set(true);
    }
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    const history = this.messages().filter((m) => !m.local);
    await this.append({ role: 'user', content, createdAt: Date.now() });
    try {
      if (classifyIntent(content) === 'offtopic') {
        await this.append({ role: 'assistant', content: OFF_TOPIC_REPLY, createdAt: Date.now(), provider: 'ArthaPath' });
        return;
      }
      const built = buildMessages({
        snapshot: this.snapshot(),
        summary: this.conversation.summary,
        history: history.filter((m) => m.createdAt > this.conversation.summarizedThrough),
        userMessage: content,
      });
      const { response, used } = await route({ messages: built.messages }, this.keys.candidates(), {
        call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal),
        now: () => Date.now(),
        onEvent: (e) => this.onRouteEvent(e),
        onHealth: (h) => void this.keys.applyHealth(h),
      });
      await this.append({
        role: 'assistant',
        content: response.text,
        createdAt: Date.now(),
        provider: this.keys.nameOf(used),
        model: response.model,
      });
      if (built.droppedCount >= SUMMARIZE_AFTER) void this.summarize(history);
    } catch (e) {
      this.note(this.errorMessage(e));
    } finally {
      this.sending.set(false);
    }
  }

  private onRouteEvent(e: RouteEvent): void {
    if (e.type === 'switch') {
      const from = this.keys.nameOf(e.from);
      const to = this.keys.nameOf(e.to);
      const why = SWITCH_REASON[e.reason] ?? 'unavailable';
      this.status.set({ provider: from, model: e.from.credentials.model, state: 'exhausted' });
      this.status.switchedTo(to, e.to.credentials.model);
      void this.notices.show(
        from === to ? `${from} key ${why}. Trying your next ${to} key.` : `${from} ${why}. Switching to ${to}.`,
        'warning',
      );
    } else if (e.type === 'success') {
      this.status.set({ provider: this.keys.nameOf(e.candidate), model: e.response.model, state: 'active' });
    }
  }

  private errorMessage(e: unknown): string {
    if (e instanceof AllProvidersExhaustedError) {
      return e.noneConfigured
        ? 'No AI provider is set up yet. Add your own API key under AI Providers to start chatting.'
        : 'All configured AI providers have reached their available limits. Please add another provider or try again later.';
    }
    if (e instanceof AIError) {
      if (e.kind === 'network') return "You appear to be offline. Your message is saved; try again when you're connected.";
      if (e.kind === 'aborted') return 'Request cancelled.';
      return `The AI provider could not process this request (${e.message}).`;
    }
    return 'Something went wrong. Please try again.';
  }

  /** Rolls older turns into an encrypted summary so prompts stay small. Best effort. */
  private async summarize(history: StoredMessage[]): Promise<void> {
    try {
      const older = history.filter((m) => m.createdAt > this.conversation.summarizedThrough).slice(0, -6);
      if (older.length < SUMMARIZE_AFTER) return;
      const transcript = older.map((m) => `${m.role}: ${m.content}`).join('\n');
      const { response } = await route(
        {
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: `${this.conversation.summary ? `Existing summary:\n${this.conversation.summary}\n\n` : ''}${transcript}` },
          ],
          temperature: 0.2,
          maxOutputTokens: 400,
        },
        this.keys.candidates(),
        {
          call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal),
          now: () => Date.now(),
          onHealth: (h) => void this.keys.applyHealth(h),
        },
      );
      this.conversation = { summary: response.text.trim(), summarizedThrough: older.at(-1)!.createdAt };
      const { serverTimestamp } = await import('firebase/firestore');
      await this.vault.put(['conversations', CONV], this.conversation, { createdAt: serverTimestamp() });
    } catch {
      // Summaries are an optimization; the next turn retries.
    }
  }

  private async append(m: StoredMessage): Promise<ChatItem> {
    const id = crypto.randomUUID();
    const item: ChatItem = { ...m, id };
    this.messages.update((ms) => [...ms, item]);
    try {
      const { serverTimestamp } = await import('firebase/firestore');
      await this.vault.put([...MESSAGES, id], m, { createdAt: serverTimestamp() });
    } catch {
      // Offline: Firestore queues the write; shown locally meanwhile.
    }
    return item;
  }

  private note(content: string): void {
    this.messages.update((ms) => [
      ...ms,
      { id: crypto.randomUUID(), role: 'assistant', content, createdAt: Date.now(), local: true, provider: 'ArthaPath' },
    ]);
  }
}
