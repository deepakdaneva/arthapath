import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('ion-palette-dark');
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
  });

  it('defaults to system and follows the OS preference', () => {
    const t = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(t.mode()).toBe('system');
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(false);
  });

  it('applies and persists dark mode', () => {
    const t = TestBed.inject(ThemeService);
    t.mode.set('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
    expect(localStorage.getItem('arthapath.theme')).toBe('dark');
  });
});
