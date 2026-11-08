import { describe, expect, it } from 'vitest';
import { autoBreakFor, computeBreak, requiredBreak } from '../breaks';

const block = (s1: string, e1: string, s2: string | null = null, e2: string | null = null) =>
  ({ start1: s1, end1: e1, start2: s2, end2: e2 });

describe('Mindestpause § 4 ArbZG', () => {
  it('Schwellen', () => {
    expect(requiredBreak(360)).toBe(0);
    expect(requiredBreak(361)).toBe(30);
    expect(requiredBreak(540)).toBe(30);
    expect(requiredBreak(541)).toBe(45);
  });

  it('bis 6 h keine Pause', () => {
    expect(computeBreak(block('08:00', '14:00'), null)).toMatchObject({ autoBreak: 0, net: 360 });
  });

  it('6:10 h Anwesenheit → 10 min Abzug, Netto 6:00 h', () => {
    expect(computeBreak(block('08:00', '14:10'), null)).toMatchObject({ autoBreak: 10, net: 360 });
  });

  it('8:18 h Anwesenheit → 30 min, Netto 7:48 h', () => {
    expect(computeBreak(block('07:30', '15:48'), null)).toMatchObject({ autoBreak: 30, net: 468 });
  });

  it('9:30 h Anwesenheit → 30 min, Netto genau 9:00 h', () => {
    expect(computeBreak(block('07:00', '16:30'), null)).toMatchObject({ autoBreak: 30, net: 540 });
  });

  it('9:35 h Anwesenheit → 35 min, Netto 9:00 h', () => {
    expect(autoBreakFor(575, 0)).toBe(35);
  });

  it('10:00 h Anwesenheit → 45 min', () => {
    expect(computeBreak(block('07:00', '17:00'), null)).toMatchObject({ autoBreak: 45, net: 555 });
  });

  it('manuelle Pause erhöht den Abzug', () => {
    expect(computeBreak(block('07:30', '15:48'), 45)).toMatchObject({ autoBreak: 30, deducted: 45, net: 453 });
  });

  it('manuelle Pause unter Minimum wird angehoben', () => {
    expect(computeBreak(block('07:30', '15:48'), 15)).toMatchObject({ deducted: 30 });
  });

  it('Lücke ≥ 15 min zwischen den Blöcken zählt als Pause', () => {
    // 07:00–12:00 und 12:30–16:00 = 8:30 h Arbeit, 30 min Lücke
    expect(computeBreak(block('07:00', '12:00', '12:30', '16:00'), null))
      .toMatchObject({ presence: 510, gapCredit: 30, autoBreak: 0, net: 510 });
  });

  it('Lücke unter 15 min zählt nicht', () => {
    expect(computeBreak(block('07:00', '12:00', '12:10', '15:40'), null))
      .toMatchObject({ gapCredit: 0, autoBreak: 30, net: 480 });
  });

  it('kurze Lücke bei langem Tag wird auf 45 min aufgefüllt', () => {
    // 10:00 h Arbeit in zwei Blöcken, 20 min Lücke → 25 min zusätzlich
    expect(computeBreak(block('06:00', '11:00', '11:20', '16:20'), null))
      .toMatchObject({ presence: 600, gapCredit: 20, autoBreak: 25, net: 575 });
  });
});
