import { routineDisplayName } from '../brand';

describe('customer-facing routine branding', () => {
  it('maps the legacy seeded name without changing unrelated or stored values', () => {
    expect(routineDisplayName('Prism 3')).toBe('Repello 3');
    expect(routineDisplayName('Spectrum 4')).toBe('Spectrum 4');
    expect(routineDisplayName('My plan')).toBe('My plan');
  });
});
