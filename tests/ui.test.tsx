import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within, act as rtlAct } from '@testing-library/react';
import { App } from '../src/ui/App';
import { getState } from '../src/store/store';

describe('playing through the app', () => {
  it('onboards, completes a Daily, earns XP and gold, and adds a task', () => {
    render(<App />);

    // step 1: name and tone
    fireEvent.change(screen.getByLabelText('What should Ember call you?'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /Dry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next: pick your first tasks/ }));

    // step 2: suggested picks are pre-selected (6 Dailies fill the 6 slots)
    expect(screen.getByText(/Dailies 6 of 6/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Light the hearth/ }));

    // Today
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(getState().profile).toMatchObject({ name: 'Sam', tone: 'dry', onboarded: true });
    expect(getState().tasks).toHaveLength(7);

    const walk = screen.getByRole('checkbox', { name: /walk for 20 minutes/i }) as HTMLInputElement;
    fireEvent.click(walk);
    expect(walk.checked).toBe(true);
    // Easy walk (10) + Spark (30) at Momentum 1.00
    expect(getState().xp).toBeCloseTo(40, 5);
    expect(getState().gold).toBeGreaterThan(0);
    expect(screen.getByText('Spark lit')).toBeTruthy();
    // 40 XP is past level 2 (30 XP)
    expect(screen.getByText(/Level 2/)).toBeTruthy();

    // undo by unchecking
    fireEvent.click(walk);
    expect(getState().xp).toBe(0);
    fireEvent.click(walk);

    // add a custom to-do with live pricing
    fireEvent.click(screen.getByRole('button', { name: /Add a task/ }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'To-do' }));
    fireEvent.change(within(dialog).getByLabelText('Task'), { target: { value: 'Call the bank' } });
    fireEvent.change(within(dialog).getByLabelText(/Dread/), { target: { value: '5' } });
    expect(within(dialog).getByText('Medium')).toBeTruthy(); // 2 effort + 5 dread + 1 (15 min) = 8
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add task' }));
    expect(getState().tasks.some((t) => t.title === 'Call the bank' && t.type === 'todo')).toBe(true);

    // the wisp has notes waiting (welcome and the level-up)
    fireEvent.click(screen.getByRole('button', { name: /Ember has \d+ new note/ }));
    expect(screen.getByRole('dialog', { name: 'Ember' })).toBeTruthy();
    expect(screen.getByText(/Level 2\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // other tabs render
    fireEvent.click(screen.getByRole('button', { name: 'Quest' }));
    expect(screen.getByRole('heading', { name: 'Quest' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hero' }));
    expect(screen.getByRole('img', { name: /Stat shape/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Trophies/ }));
    expect(screen.getByText('First Spark')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Treasury' }));
    expect(screen.getByRole('heading', { name: 'Your real-life rewards' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: /Tester report/ })).toBeTruthy();
    rtlAct(() => undefined);
  });
});
