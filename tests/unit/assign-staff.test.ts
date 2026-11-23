import { describe, expect, it } from 'vitest';
import { assignStaff } from '@/domain/assign-staff';

const ORDER = ['a', 'b', 'c'];

describe('assignStaff (B4)', () => {
  it('elige al que tiene menos citas ese día', () => {
    expect(assignStaff(['a', 'b', 'c'], new Map([['a', 2], ['b', 0], ['c', 1]]), ORDER)).toBe('b');
  });

  it('si empatan, elige el de position menor', () => {
    expect(assignStaff(['c', 'b'], new Map([['b', 1], ['c', 1]]), ORDER)).toBe('b');
    expect(assignStaff(['c', 'a'], new Map(), ORDER)).toBe('a');
  });

  it('solo elige entre los libres', () => {
    expect(assignStaff(['c'], new Map([['a', 0], ['c', 5]]), ORDER)).toBe('c');
  });

  it('sin libres devuelve null', () => {
    expect(assignStaff([], new Map(), ORDER)).toBeNull();
  });
});
