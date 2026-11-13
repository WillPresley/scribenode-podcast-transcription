export interface ChangelogSection {
  heading: string;
  items: {
    lead: string;
    detail: string;
    raw: string;
  }[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  sections: ChangelogSection[];
}

/**
 * Parses Keep-a-Changelog style markdown (e.g. root CHANGELOG.md)
 * into structured version entries for UI rendering.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  if (!markdown || !markdown.trim()) {
    return [];
  }

  const lines = markdown.split(/\r?\n/);
  const releases: ChangelogRelease[] = [];
  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match release headings like:
    // ## [1.7.0] - 2026-11-13 — Release Title
    // or ## [1.0.0] - 2026-07-01
    const releaseMatch = trimmed.match(
      /^##\s+\[([^\]]+)\](?:\s*-\s*([^\s—–-]+(?:-[^\s—–-]+)*))?(?:\s*[—–-]\s*(.+))?$/
    );

    if (releaseMatch) {
      if (currentSection && currentRelease && currentSection.items.length > 0) {
        currentRelease.sections.push(currentSection);
      }
      if (currentRelease) {
        releases.push(currentRelease);
      }

      currentRelease = {
        version: releaseMatch[1].trim(),
        date: (releaseMatch[2] || '').trim(),
        title: (releaseMatch[3] || '').trim(),
        sections: []
      };
      currentSection = null;
      continue;
    }

    if (!currentRelease) {
      continue;
    }

    // Match subsection headings like ### Added, ### Changed, ### Fixed
    const sectionMatch = trimmed.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      if (currentSection && currentSection.items.length > 0) {
        currentRelease.sections.push(currentSection);
      }
      currentSection = {
        heading: sectionMatch[1].trim(),
        items: []
      };
      continue;
    }

    // Match bullet points like:
    // - **Title**: Description text
    // - Description text
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentSection) {
        currentSection = { heading: 'Highlights', items: [] };
      }
      const rawBody = trimmed.slice(2).trim();
      const boldLeadMatch = rawBody.match(/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/);
      if (boldLeadMatch) {
        currentSection.items.push({
          lead: boldLeadMatch[1].replace(/:$/, '').trim(),
          detail: boldLeadMatch[2].trim(),
          raw: rawBody
        });
      } else {
        currentSection.items.push({
          lead: '',
          detail: rawBody,
          raw: rawBody
        });
      }
    }
  }

  if (currentSection && currentRelease && currentSection.items.length > 0) {
    currentRelease.sections.push(currentSection);
  }
  if (currentRelease) {
    releases.push(currentRelease);
  }

  return releases;
}
