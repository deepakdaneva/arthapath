import { Injectable, Injector, inject } from '@angular/core';

/** Short toast notices (for example AI provider switches). The toast code loads on first use. */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly injector = inject(Injector);

  async show(message: string, color: 'medium' | 'warning' | 'danger' | 'success' = 'medium'): Promise<void> {
    const { ToastController } = await import('@ionic/angular/toast-controller');
    const toast = await this.injector.get(ToastController).create({
      message,
      color,
      duration: 4000,
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }
}
