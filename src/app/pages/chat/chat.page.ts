import { Component, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { MarkdownPipe } from '../../ai/markdown.pipe';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonTextarea } from '@ionic/angular/ion-textarea';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, send } from 'ionicons/icons';
import { AiKeysService } from '../../ai/ai-keys.service';
import { ChatService } from '../../ai/chat.service';
import { CHAT_STARTERS, ONBOARDING_STARTERS } from '../../ai/starters';
import { ProfileService } from '../../domain/profile.service';

@Component({
  selector: 'app-chat',
  imports: [IonContent, IonButton, IonIcon, IonSpinner, IonTextarea, FormsModule, RouterLink, MarkdownPipe],
  template: `
    <ion-content #content>
      <div class="ap-container thread" aria-live="polite">
        @if (!chat.loaded()) {
          <ion-spinner name="crescent" aria-label="Loading conversation" />
        } @else if (chat.messages().length === 0) {
          <div class="empty">
            <ion-icon name="chatbubbles-outline" aria-hidden="true" />
            @if (!profile.hasData()) {
              <h1>First, tell ArthaPath about your finances</h1>
              <p class="ap-muted">
                Share your income, regular expenses, loans, savings, family, and goals in your own words.
                Pick a starting point below; you can fill in the blanks.
              </p>
              <div class="starters" role="group" aria-label="Start with a template">
                @for (s of onboardingStarters; track s.label) {
                  <a class="chip" routerLink="/app/onboarding" [queryParams]="{ prefill: s.text }">{{ s.label }}</a>
                }
              </div>
            } @else {
              <h1>Chat</h1>
              <p class="ap-muted">
                Ask about your plan, budgeting, loans, investments, insurance, or taxes. ArthaPath already
                knows the details you shared, and your conversation is encrypted.
              </p>
            }
            <p class="ap-muted safety">Messages go to the AI provider you set up, under its terms. Never share ID, card, or account numbers, OTPs, or passwords: ArthaPath removes the ones it recognizes before saving or sending.</p>
            @if (keys.loaded() && keys.keys().length === 0) {
              <ion-button routerLink="/app/ai-providers">Add an AI provider</ion-button>
            }
          </div>
        }
        @for (m of chat.messages(); track m.id) {
          <div class="msg {{ m.role }}" [class.local]="m.local">
            @if (m.role === 'assistant' && !m.local) {
              <div class="bubble ap-markdown" [innerHTML]="m.content | markdown"></div>
            } @else {
              <div class="bubble">{{ m.content }}</div>
            }
            @if (m.role === 'assistant' && m.provider) {
              <span class="meta">{{ m.provider }}{{ m.model ? ' · ' + m.model : '' }}</span>
            }
          </div>
        }
        @if (chat.sending()) {
          <div class="msg assistant"><div class="bubble typing" aria-label="Thinking">…</div></div>
        }
      </div>
    </ion-content>
    @if (profile.hasData() && chat.messages().length === 0) {
      <div class="starters bar" role="group" aria-label="Suggested questions">
        @for (s of chatStarters; track s.label) {
          <button type="button" class="chip" (click)="text.set(s.text)">{{ s.label }}</button>
        }
      </div>
    }
    <form class="composer" (ngSubmit)="submit()">
      <ion-textarea
        aria-label="Message"
        [placeholder]="profile.hasData() ? 'Ask about your finances…' : 'Start with your income, expenses, loans, savings, and goals…'"
        [autoGrow]="true"
        [rows]="1"
        [maxlength]="4000"
        name="text"
        [ngModel]="text()"
        (ngModelChange)="text.set($event ?? '')"
        (keydown.enter)="onEnter($event)"
      />
      <ion-button type="submit" [disabled]="!text().trim() || chat.sending()" aria-label="Send">
        <ion-icon slot="icon-only" name="send" aria-hidden="true" />
      </ion-button>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    ion-content {
      flex: 1;
    }
    .thread {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 12px;
      padding-bottom: 96px;
      max-width: 820px;
    }
    .empty {
      text-align: center;
      padding-top: 10vh;
      ion-icon {
        font-size: 48px;
        color: var(--ion-color-secondary);
      }
      p {
        max-width: 460px;
        margin: 0 auto 16px;
        line-height: 1.6;
      }
    }
    .msg {
      display: flex;
      flex-direction: column;
      max-width: 85%;
    }
    .msg.user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .bubble {
      padding: 10px 14px;
      border-radius: 16px;
      white-space: pre-wrap;
      line-height: 1.5;
      overflow-wrap: anywhere;
      background: var(--ap-surface);
      border: 1px solid var(--ap-border);
    }
    .bubble.ap-markdown {
      white-space: normal;
    }
    .user .bubble {
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
      border-color: transparent;
    }
    .local .bubble {
      background: rgba(var(--ion-color-warning-rgb), 0.1);
      border-color: rgba(var(--ion-color-warning-rgb), 0.35);
    }
    .typing {
      letter-spacing: 3px;
      color: var(--ap-text-muted);
    }
    .safety {
      font-size: 0.8rem;
      max-width: 520px;
    }
    .meta {
      margin-top: 4px;
      font-size: 0.72rem;
      color: var(--ap-text-muted);
    }
    .starters {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .starters.bar {
      flex-wrap: nowrap;
      justify-content: flex-start;
      overflow-x: auto;
      margin: 0;
      padding: 8px 12px 0;
      background: var(--ap-surface);
    }
    .chip {
      flex: none;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(var(--ion-color-secondary-rgb), 0.4);
      background: rgba(var(--ion-color-secondary-rgb), 0.08);
      color: var(--ion-color-secondary);
      font: inherit;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
    }
    .composer {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 8px 12px;
      background: var(--ap-surface);
      border-top: 1px solid var(--ap-border);
      ion-textarea {
        flex: 1;
        --padding-start: 12px;
        --padding-end: 12px;
        border: 1px solid var(--ap-border);
        border-radius: 14px;
        max-height: 160px;
      }
    }
  `,
})
export class ChatPage {
  readonly chat = inject(ChatService);
  readonly keys = inject(AiKeysService);
  readonly profile = inject(ProfileService);
  readonly onboardingStarters = ONBOARDING_STARTERS;
  readonly chatStarters = CHAT_STARTERS;
  readonly text = signal('');
  private readonly content = viewChild.required<IonContent>('content');

  constructor() {
    addIcons({ chatbubblesOutline, send });
    effect(() => {
      this.chat.messages();
      this.chat.sending();
      setTimeout(() => void this.content().scrollToBottom(200));
    });
  }

  onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      void this.submit();
    }
  }

  async submit(): Promise<void> {
    const t = this.text();
    if (!t.trim()) return;
    this.text.set('');
    await this.chat.send(t);
  }
}
