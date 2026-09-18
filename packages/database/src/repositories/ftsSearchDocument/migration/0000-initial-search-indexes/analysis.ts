export const analysis = {
  analyzer: {
    orvilo_cjk_bigram_english: {
      /** Normalize width and case before generating CJK bigrams so decomposed characters stay intact. */
      filter: [
        'english_possessive_stemmer',
        'icu_folding',
        'cjk_bigram',
        'english_stop',
        'english_stemmer',
      ],
      tokenizer: 'standard',
      type: 'custom',
    },
    orvilo_filename: {
      filter: ['icu_folding'],
      tokenizer: 'orvilo_filename',
      type: 'custom',
    },
    orvilo_icu: {
      filter: ['icu_folding'],
      tokenizer: 'icu_tokenizer',
      type: 'custom',
    },
    orvilo_icu_english: {
      filter: ['english_possessive_stemmer', 'icu_folding', 'english_stop', 'english_stemmer'],
      tokenizer: 'icu_tokenizer',
      type: 'custom',
    },
  },
  filter: {
    english_possessive_stemmer: {
      language: 'possessive_english',
      type: 'stemmer',
    },
    english_stemmer: {
      language: 'english',
      type: 'stemmer',
    },
    english_stop: {
      stopwords: '_english_',
      type: 'stop',
    },
  },
  tokenizer: {
    orvilo_filename: {
      tokenize_on_chars: ['whitespace', '-', '_', '/', '.'],
      type: 'char_group',
    },
  },
} as const;
