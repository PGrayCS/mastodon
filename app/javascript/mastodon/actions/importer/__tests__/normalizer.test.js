import { normalizeStatus, searchTextFromRawStatus } from '../normalizer';

// Mock the initial_state module
vi.mock('../../../initial_state', () => ({
  expandSpoilers: false,
}));

describe('normalizeStatus', () => {
  const createBaseStatus = (overrides = {}) => ({
    id: '1',
    account: { id: 'account1' },
    content: '<p>Hello world</p>',
    spoiler_text: '',
    sensitive: false,
    media_attachments: [],
    url: 'https://example.com/@user/1',
    uri: 'https://example.com/@user/1',
    ...overrides,
  });

  describe('quote handling', () => {
    it('sets normalStatus.quote when status.quote exists with available quoted_status', () => {
      const status = createBaseStatus({
        content: '<p>This is a quote post</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'accepted',
          quoted_status: { id: 'quoted1' },
          quoted_status_id: 'quoted1',
        },
      });

      const result = normalizeStatus(status, null, {});

      expect(result.quote).toBeDefined();
      expect(result.quote.state).toBe('accepted');
      expect(result.quote.quoted_status).toBe('quoted1');
    });

    it('sets normalStatus.quote when status.quote exists but quoted_status is unavailable (deleted)', () => {
      // This is the key fix - when a quoted status is deleted, the API returns
      // quote: { state: 'deleted' } without quoted_status or quoted_status_id
      const status = createBaseStatus({
        content: '<p>This is a quote post</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'deleted',
          // Note: no quoted_status or quoted_status_id
        },
      });

      const result = normalizeStatus(status, null, {});

      // The fix ensures normalStatus.quote is set even when quoted_status is unavailable
      expect(result.quote).toBeDefined();
      expect(result.quote.state).toBe('deleted');
      expect(result.quote.quoted_status).toBeUndefined();
    });

    it('sets normalStatus.quote when status.quote exists but quoted_status is unauthorized', () => {
      const status = createBaseStatus({
        content: '<p>This is a quote post</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'unauthorized',
        },
      });

      const result = normalizeStatus(status, null, {});

      expect(result.quote).toBeDefined();
      expect(result.quote.state).toBe('unauthorized');
    });

    it('does not set normalStatus.quote when status.quote is null', () => {
      const status = createBaseStatus({
        content: '<p>This is a regular post</p>',
        quote: null,
      });

      const result = normalizeStatus(status, null, {});

      expect(result.quote).toBeNull();
    });

    it('does not set normalStatus.quote when status.quote is undefined', () => {
      const status = createBaseStatus({
        content: '<p>This is a regular post</p>',
      });

      const result = normalizeStatus(status, null, {});

      expect(result.quote).toBeUndefined();
    });
  });

  describe('search_index with quote fallback stripping', () => {
    it('strips quote fallback from search_index when quote is available', () => {
      const status = createBaseStatus({
        content: '<p>I really enjoyed this episode</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'accepted',
          quoted_status: { id: 'quoted1' },
        },
      });

      const result = normalizeStatus(status, null, {});

      // The search_index should NOT contain "RE: https://..."
      expect(result.search_index).toBe('I really enjoyed this episode');
      expect(result.search_index).not.toContain('RE:');
      expect(result.search_index).not.toContain('https://example.com/@other/2');
    });

    it('strips quote fallback from search_index when quoted_status is unavailable (deleted)', () => {
      // This is the critical test case for the bug fix
      const status = createBaseStatus({
        content: '<p>I really enjoyed this episode</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'deleted',
          // No quoted_status - it was deleted
        },
      });

      const result = normalizeStatus(status, null, {});

      // Even when the quoted status is unavailable, we should strip the fallback
      // This is the bug that was fixed - previously this would show "RE: https://..."
      expect(result.search_index).toBe('I really enjoyed this episode');
      expect(result.search_index).not.toContain('RE:');
      expect(result.search_index).not.toContain('https://example.com/@other/2');
    });

    it('preserves full content in search_index when no quote exists', () => {
      const status = createBaseStatus({
        content: '<p>This is a regular post without any quote</p>',
      });

      const result = normalizeStatus(status, null, {});

      expect(result.search_index).toBe('This is a regular post without any quote');
    });
  });

  describe('contentHtml with quote fallback stripping', () => {
    it('strips quote fallback from contentHtml when quote exists', () => {
      const status = createBaseStatus({
        content: '<p>Hello world</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'accepted',
          quoted_status: { id: 'quoted1' },
        },
      });

      const result = normalizeStatus(status, null, {});

      expect(result.contentHtml).toBe('<p>Hello world</p>');
      expect(result.contentHtml).not.toContain('quote-inline');
    });

    it('strips quote fallback from contentHtml when quoted_status is unavailable', () => {
      const status = createBaseStatus({
        content: '<p>Hello world</p><p class="quote-inline">RE: https://example.com/@other/2</p>',
        quote: {
          state: 'deleted',
        },
      });

      const result = normalizeStatus(status, null, {});

      expect(result.contentHtml).toBe('<p>Hello world</p>');
      expect(result.contentHtml).not.toContain('quote-inline');
    });

    it('preserves contentHtml when no quote exists', () => {
      const status = createBaseStatus({
        content: '<p>Regular post content</p>',
      });

      const result = normalizeStatus(status, null, {});

      expect(result.contentHtml).toBe('<p>Regular post content</p>');
    });
  });
});

describe('searchTextFromRawStatus', () => {
  const createBaseStatus = (overrides = {}) => ({
    content: '<p>Hello world</p>',
    spoiler_text: '',
    media_attachments: [],
    ...overrides,
  });

  it('strips quote fallback from content when quote exists', () => {
    const status = createBaseStatus({
      content: '<p>Great post</p><p class="quote-inline">RE: https://example.com/@user/1</p>',
      quote: { state: 'accepted' },
    });

    const result = searchTextFromRawStatus(status);

    expect(result).toBe('Great post');
    expect(result).not.toContain('RE:');
  });

  it('strips quote fallback when quoted status is unavailable', () => {
    const status = createBaseStatus({
      content: '<p>Great post</p><p class="quote-inline">RE: https://example.com/@user/1</p>',
      quote: { state: 'deleted' },
    });

    const result = searchTextFromRawStatus(status);

    expect(result).toBe('Great post');
    expect(result).not.toContain('RE:');
  });

  it('preserves full content when no quote exists', () => {
    const status = createBaseStatus({
      content: '<p>Regular post</p>',
    });

    const result = searchTextFromRawStatus(status);

    expect(result).toBe('Regular post');
  });
});
