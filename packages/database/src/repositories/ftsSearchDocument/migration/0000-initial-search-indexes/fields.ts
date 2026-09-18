export const mixedText = { analyzer: 'orvilo_icu_english', type: 'text' } as const;
export const memoryText = { analyzer: 'orvilo_cjk_bigram_english', type: 'text' } as const;
export const memoryTextWithRaw = {
  analyzer: 'orvilo_cjk_bigram_english',
  fields: { raw: { ignore_above: 256, type: 'keyword' } },
  type: 'text',
} as const;
export const fileNameText = {
  analyzer: 'orvilo_filename',
  fields: {
    raw: { ignore_above: 256, type: 'keyword' },
    words: { analyzer: 'orvilo_icu', type: 'text' },
  },
  type: 'text',
} as const;
export const icuText = {
  analyzer: 'orvilo_icu',
  fields: { raw: { ignore_above: 256, type: 'keyword' } },
  type: 'text',
} as const;
export const keyword = { type: 'keyword' } as const;
export const date = { type: 'date' } as const;
export const integer = { type: 'integer' } as const;
export const boolean = { type: 'boolean' } as const;

export const ownershipProperties = {
  user_id: keyword,
  visibility: keyword,
  workspace_id: keyword,
};

export const timestampProperties = {
  created_at: date,
  updated_at: date,
};

export const projectionMetadataProperties = {
  fts_search_sync_deleted: boolean,
};
