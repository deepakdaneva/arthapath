import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton } from '@ionic/angular/ion-button';
import { IonCheckbox } from '@ionic/angular/ion-checkbox';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonInput } from '@ionic/angular/ion-input';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';
import { AuthService, authErrorMessage } from '../../core/auth.service';
import { googleWebClientId } from '../../../environments/app-config';

type Mode = 'signin' | 'signup' | 'reset';

@Component({
  selector: 'app-auth',
  imports: [IonContent, IonButton, IonCheckbox, IonInput, IonIcon, IonSpinner, ReactiveFormsModule, RouterLink],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('signin');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly info = signal('');
  /** Sign-up requires agreeing to the Terms and Privacy Policy. */
  readonly agreed = signal(false);
  /** Browsers use a popup; Android uses the native account picker when the build has a Google client ID. */
  readonly googleAvailable = !Capacitor.isNativePlatform() || !!googleWebClientId;

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });

  constructor() {
    addIcons({ logoGoogle });
    const m = inject(ActivatedRoute).snapshot.queryParamMap.get('mode');
    if (m === 'signup' || m === 'signin') this.mode.set(m);
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set('');
    this.info.set('');
  }

  async google(): Promise<void> {
    if (!this.termsOk()) return;
    await this.run(() => this.auth.signInWithGoogle());
  }

  async submit(): Promise<void> {
    const { name, email, password } = this.form.getRawValue();
    const m = this.mode();
    if (m === 'reset') {
      if (this.form.controls.email.invalid) return this.form.controls.email.markAsTouched();
      await this.run(async () => {
        await this.auth.resetPassword(email);
        this.info.set('If an account exists for this email, a reset link is on its way.');
      }, false);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.termsOk()) return;
    await this.run(() =>
      m === 'signup' ? this.auth.signUpWithEmail(name, email, password) : this.auth.signInWithEmail(email, password),
    );
  }

  private termsOk(): boolean {
    if (this.mode() !== 'signup' || this.agreed()) return true;
    this.error.set('Please agree to the Terms and Privacy Policy to create an account.');
    return false;
  }

  private async run(fn: () => Promise<void>, navigate = true): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      if (navigate) await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (e) {
      // Reset flow: never reveal whether an email is registered.
      if (this.mode() === 'reset') {
        this.info.set('If an account exists for this email, a reset link is on its way.');
      } else {
        this.error.set(authErrorMessage(e));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
