import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonInput } from '@ionic/angular/ion-input';
import { IonSelect } from '@ionic/angular/ion-select';
import { IonSelectOption } from '@ionic/angular/ion-select-option';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonToggle } from '@ionic/angular/ion-toggle';
import { addIcons } from 'ionicons';
import { arrowDownOutline, arrowUpOutline, createOutline, openOutline, trashOutline } from 'ionicons/icons';
import { adapterFor, pickModel, type AIModel } from '../../ai/adapters';
import { AiKeysService, type AiKeyView } from '../../ai/ai-keys.service';
import { AIError } from '../../ai/errors';
import { PROVIDER_DATA_NOTICE, keyGuideFor } from '../../ai/key-guides';
import { CUSTOM_PRESETS, PROVIDERS, customBaseUrlError, type ProviderId } from '../../ai/providers';

interface Draft {
  provider: ProviderId;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

// No model until the provider's live list is fetched.
const EMPTY: Draft = { provider: 'groq', label: '', apiKey: '', baseUrl: '', model: '' };

@Component({
  selector: 'app-ai-providers',
  imports: [IonContent, IonButton, IonIcon, IonInput, IonSelect, IonSelectOption, IonSpinner, IonToggle, FormsModule],
  templateUrl: './ai-providers.page.html',
  styleUrl: './ai-providers.page.scss',
})
export class AiProvidersPage {
  readonly svc = inject(AiKeysService);
  readonly providers = Object.values(PROVIDERS);
  readonly presets = CUSTOM_PRESETS;
  readonly dataNotice = PROVIDER_DATA_NOTICE;

  /** null = closed; 'new' = adding; otherwise the id being edited. */
  readonly editing = signal<string | null>(null);
  readonly draft = signal<Draft>({ ...EMPTY });
  readonly models = signal<AIModel[]>([]);
  readonly loadingModels = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly info = signal('');

  readonly providerInfo = computed(() => PROVIDERS[this.draft().provider]);
  readonly guide = computed(() => keyGuideFor(this.draft().provider, this.draft().baseUrl));
  readonly isEdit = computed(() => this.editing() !== null && this.editing() !== 'new');
  readonly baseUrlError = computed(() =>
    this.draft().provider === 'custom' && this.draft().baseUrl ? customBaseUrlError(this.draft().baseUrl) : null,
  );
  readonly canSave = computed(() => {
    const d = this.draft();
    const keyOk = this.isEdit() || d.apiKey.trim().length >= 8 || (d.provider === 'custom' && /localhost|127\.0\.0\.1/.test(d.baseUrl));
    const urlOk = d.provider !== 'custom' || (!!d.baseUrl && !this.baseUrlError());
    // A new key may be saved before its models are fetched: save() fetches them first.
    const modelOk = !!d.model.trim() || (!this.isEdit() && !this.models().length);
    return keyOk && urlOk && modelOk && !this.busy() && !this.loadingModels();
  });

  constructor() {
    addIcons({ arrowUpOutline, arrowDownOutline, trashOutline, createOutline, openOutline });
  }

  patch(p: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  setProvider(provider: ProviderId): void {
    this.models.set([]);
    this.info.set('');
    this.error.set('');
    this.patch({ provider, model: '', baseUrl: provider === 'custom' ? CUSTOM_PRESETS[0]!.baseUrl : '' });
    if (this.draft().apiKey.trim()) void this.loadModels();
  }

  /** Fetches the live model list once a key has been entered. */
  onKeyEntered(): void {
    if (this.draft().apiKey.trim().length >= 8 && !this.loadingModels()) void this.loadModels();
  }

  startAdd(): void {
    this.reset();
    this.editing.set('new');
  }

  startEdit(k: AiKeyView): void {
    this.reset();
    this.editing.set(k.id);
    this.draft.set({ provider: k.provider, label: k.label, apiKey: '', baseUrl: k.baseUrl ?? '', model: k.model });
    void this.loadModels();
  }

  cancel(): void {
    this.editing.set(null);
    this.reset();
  }

  /** Validates the key by listing models; also fills the model picker. */
  async loadModels(): Promise<void> {
    const d = this.draft();
    if (!d.apiKey.trim() && !this.isEdit()) {
      this.error.set('Enter the API key first.');
      return;
    }
    this.loadingModels.set(true);
    this.error.set('');
    this.info.set('');
    this.overLimit = false;
    try {
      const apiKey = d.apiKey.trim() || this.existingKey();
      const models = await adapterFor(d.provider).listModels({ provider: d.provider, apiKey, baseUrl: d.baseUrl || undefined });
      this.models.set(models);
      // Keep the user's model while the provider still offers it; otherwise suggest one from the live list.
      const kept = models.some((m) => m.id === d.model);
      if (models.length && !kept) this.patch({ model: pickModel(d.provider, models)! });
      if (!models.length) {
        this.info.set('Key works, but the provider listed no models. Type the model name.');
      } else if (this.isEdit() && d.model && !kept) {
        this.info.set(`Key works. "${d.model}" is no longer offered; ${this.draft().model} is selected instead. Save to apply.`);
      } else {
        this.info.set(`Key works. ${models.length} models available.`);
      }
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loadingModels.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    // A new key is always checked against the provider and given a real model name.
    if (!this.isEdit() && !this.models().length) {
      await this.loadModels();
      if (this.error() && !this.overLimit) return;
    }
    if (!this.draft().model.trim()) {
      this.error.set('Choose or type a model.');
      return;
    }
    const d = this.draft();
    this.busy.set(true);
    this.error.set('');
    try {
      const label = d.label.trim() || (d.provider === 'custom' ? this.presetName(d.baseUrl) : PROVIDERS[d.provider].name);
      if (this.isEdit()) {
        await this.svc.update(this.editing()!, {
          label,
          model: d.model.trim(),
          ...(d.provider === 'custom' ? { baseUrl: d.baseUrl } : {}),
          ...(d.apiKey.trim() ? { apiKey: d.apiKey } : {}),
        });
      } else {
        await this.svc.add({
          provider: d.provider,
          label,
          apiKey: d.apiKey,
          model: d.model.trim(),
          ...(d.provider === 'custom' ? { baseUrl: d.baseUrl } : {}),
        });
      }
      this.cancel();
    } catch {
      this.error.set('Could not save. Check your connection and try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async toggle(k: AiKeyView, enabled: boolean): Promise<void> {
    await this.svc.update(k.id, { enabled });
  }

  async remove(k: AiKeyView): Promise<void> {
    if (!confirm(`Remove ${k.label || k.providerName} (${k.masked})? The key is deleted from ArthaPath.`)) return;
    await this.svc.remove(k.id);
  }

  statusText(k: AiKeyView): string {
    switch (k.status) {
      case 'ready':
        return 'Ready';
      case 'disabled':
        return 'Disabled';
      case 'invalid':
        return 'Key rejected: replace it';
      case 'model':
        return 'Model unavailable: pick another';
      case 'cooling':
        return `Limit reached · retry after ${new Date(k.cooldownUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  private presetName(url: string): string {
    return CUSTOM_PRESETS.find((p) => p.baseUrl === url)?.name ?? 'Custom';
  }

  private existingKey(): string {
    return this.svc.candidates().find((c) => c.id === this.editing())?.credentials.apiKey ?? '';
  }

  /** True when the last check failed only because the key is over its limit. */
  private overLimit = false;

  private describe(e: unknown): string {
    this.overLimit = e instanceof AIError && (e.kind === 'quota_exhausted' || e.kind === 'rate_limited');
    if (e instanceof AIError) {
      switch (e.kind) {
        case 'auth_invalid':
          return 'The provider rejected this key. Check that it is copied correctly and active.';
        case 'network':
          return 'Could not reach the provider. Check your connection (or that the local server is running).';
        case 'quota_exhausted':
        case 'rate_limited':
          return 'The key is valid but currently over its limit. You can still save it.';
        default:
          return `The provider returned an error: ${e.message}`;
      }
    }
    return 'Could not check the key.';
  }

  private reset(): void {
    this.draft.set({ ...EMPTY });
    this.models.set([]);
    this.error.set('');
    this.info.set('');
  }
}
