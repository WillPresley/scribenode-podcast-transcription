import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseChangelog } from '../../src/utils/changelog';

describe('CHANGELOG.md Parser & Version History Integrity', () => {
  it('parses structured Keep-a-Changelog releases accurately', () => {
    const sample = `
# Changelog

## [2.1.0] - 2026-12-01 — Holiday Release

### Added
- **Feature One**: Added awesome capability.
- Plain bullet item without bold lead.

## [2.0.0] — Major Rewrite
- **Core Engine**: Rebuilt pipeline.
`;

    const releases = parseChangelog(sample);
    expect(releases).toHaveLength(2);

    expect(releases[0].version).toBe('2.1.0');
    expect(releases[0].date).toBe('2026-12-01');
    expect(releases[0].title).toBe('Holiday Release');
    expect(releases[0].sections).toHaveLength(1);
    expect(releases[0].sections[0].heading).toBe('Added');
    expect(releases[0].sections[0].items[0]).toEqual({
      lead: 'Feature One',
      detail: 'Added awesome capability.',
      raw: '**Feature One**: Added awesome capability.'
    });
    expect(releases[0].sections[0].items[1]).toEqual({
      lead: '',
      detail: 'Plain bullet item without bold lead.',
      raw: 'Plain bullet item without bold lead.'
    });

    expect(releases[1].version).toBe('2.0.0');
    expect(releases[1].date).toBe('');
    expect(releases[1].title).toBe('Major Rewrite');
    expect(releases[1].sections[0].heading).toBe('Highlights');
  });

  it('returns an empty array for blank or empty markdown', () => {
    expect(parseChangelog('')).toEqual([]);
    expect(parseChangelog('   \n  ')).toEqual([]);
  });

  it('parses the root CHANGELOG.md from current version back to v1.0.0', () => {
    const rootDir = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    const changelogRaw = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf-8');

    const releases = parseChangelog(changelogRaw);
    expect(releases.length).toBeGreaterThanOrEqual(8);
    expect(releases[0].version).toBe(pkg.version);
    expect(releases[releases.length - 1].version).toBe('1.0.0');

    for (const release of releases) {
      expect(release.sections.length).toBeGreaterThan(0);
      const totalItems = release.sections.reduce((acc, s) => acc + s.items.length, 0);
      expect(totalItems).toBeGreaterThan(0);
    }
  });
});
