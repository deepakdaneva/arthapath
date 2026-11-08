import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AiStatusService } from './ai-status.service';

describe('AiStatusService', () => {
  it('starts unconfigured', () => {
    const ai = TestBed.inject(AiStatusService);
    expect(ai.label()).toBe('AI not configured');
    expect(ai.switchCount()).toBe(0);
  });

  it('shows exhaustion, then counts a switch to the next provider', () => {
    const ai = TestBed.inject(AiStatusService);
    ai.set({ provider: 'Gemini', model: 'flash', state: 'exhausted' });
    expect(ai.label()).toBe('Gemini limit reached');
    ai.set({ provider: 'Gemini', model: 'flash', state: 'exhausted', reason: 'model' });
    expect(ai.label()).toBe('Gemini: model unavailable');
    ai.switchedTo('Groq', 'llama-3.3-70b');
    expect(ai.label()).toBe('Groq · llama-3.3-70b');
    expect(ai.switchCount()).toBe(1);
  });
});
