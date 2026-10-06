import { useEffect, useRef, useState } from 'react';

export const useBasicSettingsDraft = (title = '', content = '') => {
  const [draft, setDraft] = useState({ content, title });
  const persisted = useRef({ content, title });

  useEffect(() => {
    const previous = persisted.current;
    persisted.current = { content, title };
    setDraft((current) => ({
      content: current.content === previous.content ? content : current.content,
      title: current.title === previous.title ? title : current.title,
    }));
  }, [content, title]);

  return { draft, setDraft, dirty: draft.title !== title || draft.content !== content };
};
