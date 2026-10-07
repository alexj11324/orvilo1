/**
 * @vitest-environment happy-dom
 */
import { type IEditor } from '@lobehub/editor';
import { moment, ReactLinkPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { $getRoot, PASTE_COMMAND } from 'lexical';
import { memo, useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DESCRIPTION_REFERENCE_SCHEMA } from '@/libs/editor/descriptionReference';

import {
  insertDescriptionReference,
  normalizeDescriptionReferenceLinks,
} from './descriptionReferences/actions';
import { DescriptionReferenceNormalizationPlugin } from './descriptionReferences/DescriptionReferenceNormalizationPlugin';
import { createDescriptionReferenceSchemaRules } from './descriptionReferences/schemaRules';
import { type InternalEditorProps } from './InternalEditor';
import InternalEditor from './InternalEditor';
import { registerBlockDecoratorCaretGuard } from './registerBlockDecoratorCaretGuard';

vi.mock('./registerBlockDecoratorCaretGuard', () => ({
  registerBlockDecoratorCaretGuard: vi.fn(() => vi.fn()),
}));

const referenceLookup = vi.hoisted(() => ({ denied: false, navigate: vi.fn() }));
vi.mock('../../../apps/desktop/src/preload/invoke', () => ({ invoke: vi.fn() }));
vi.mock('~common/routes', () => ({ findMatchingRoute: vi.fn() }));
vi.mock('@/features/Electron/navigation/appNavigate', () => ({
  appNavigate: referenceLookup.navigate,
}));
vi.mock('@/hooks/useAppOrigin', () => ({ useAppOrigin: () => 'https://orvilo.example' }));
vi.mock('@/store/task/descriptionReference', () => ({
  useFetchDescriptionReference: (reference: { kind: string } | null) => ({
    data: reference
      ? { kind: 'pull-request', isDraft: false, state: 'MERGED', title: 'Synthetic accessible PR' }
      : undefined,
    error: referenceLookup.denied ? new Error('not readable') : undefined,
    isLoading: false,
  }),
}));

// Suppress console.warn for expected errors in tests
const originalWarn = console.warn;
beforeEach(() => {
  console.warn = vi.fn();
  referenceLookup.denied = false;
  referenceLookup.navigate.mockClear();
});

afterEach(() => {
  console.warn = originalWarn;
  cleanup();
});

/**
 * Test wrapper component that creates a real editor using useEditor hook
 * This ensures all plugins and services are properly initialized
 */
interface TestWrapperProps extends Omit<InternalEditorProps, 'editor'> {
  onEditorReady?: (editor: IEditor) => void;
}

const TestWrapper = memo<TestWrapperProps>(({ onEditorReady, ...props }) => {
  const editor = useEditor();
  const readyRef = useRef(false);

  useEffect(() => {
    if (editor && !readyRef.current) {
      readyRef.current = true;
      onEditorReady?.(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) return null;
  return <InternalEditor editor={editor} {...props} />;
});

TestWrapper.displayName = 'TestWrapper';

/**
 * Test wrapper for tests that need custom plugins (no toolbar dependencies)
 */
const MinimalTestWrapper = memo<TestWrapperProps>(({ onEditorReady, plugins, ...props }) => {
  const editor = useEditor();
  const readyRef = useRef(false);

  useEffect(() => {
    if (editor && !readyRef.current) {
      readyRef.current = true;
      onEditorReady?.(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) return null;

  // Use minimal plugins that don't require toolbar services
  const minimalPlugins = plugins || [];

  return <InternalEditor editor={editor} plugins={minimalPlugins} {...props} />;
});

MinimalTestWrapper.displayName = 'MinimalTestWrapper';

describe('InternalEditor', () => {
  describe('description reference chips', () => {
    const origin = 'https://orvilo.example';
    const url = 'https://github.com/acme/widgets/pull/7';
    const referencePlugins = [
      Editor.withProps(DescriptionReferenceNormalizationPlugin, { appOrigin: origin }),
      Editor.withProps(ReactLinkPlugin, {
        normalizeSchemaLinks: false,
        schemaRules: createDescriptionReferenceSchemaRules(origin),
      }),
    ];

    it('routes a valid issue through the renderer before the actual desktop preload intercepts it', async () => {
      let instance: IEditor | undefined;
      const issueUrl = `${origin}/ws-one/task/ISS-7`;
      const view = render(
        <MinimalTestWrapper
          editable
          plugins={referencePlugins}
          onEditorReady={(editor) => {
            instance = editor;
          }}
        />,
      );
      await waitFor(() => expect(instance?.getLexicalEditor()).toBeTruthy());
      await act(async () => {
        expect(insertDescriptionReference(instance!, issueUrl, origin)).toBe(true);
        await moment();
      });
      const anchor = view.getByRole('link', { name: /Synthetic accessible PR/ });
      const { setupRouteInterceptors } =
        await import('../../../apps/desktop/src/preload/routeInterceptor');
      const documentListener = vi.spyOn(document, 'addEventListener');
      setupRouteInterceptors();
      const preloadClick = documentListener.mock.calls.find(([event]) => event === 'click')!;
      const { invoke } = await import('../../../apps/desktop/src/preload/invoke');
      vi.mocked(invoke).mockClear();
      // The actual desktop document-capture interceptor precedes editor listeners.
      try {
        fireEvent.click(anchor);
        expect(referenceLookup.navigate).toHaveBeenCalledWith('/ws-one/task/ISS-7', {
          escape: true,
        });
        expect(anchor).toHaveAttribute(RENDERER_HANDLED_LINK_ATTR, 'true');
        expect(invoke).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('click', preloadClick[1], preloadClick[2]);
        documentListener.mockRestore();
      }
      referenceLookup.navigate.mockClear();
    });

    it('inserts a recognized link through the live editor command', async () => {
      let instance: IEditor | undefined;
      const view = render(
        <MinimalTestWrapper
          plugins={referencePlugins}
          onEditorReady={(editor) => {
            instance = editor;
          }}
        />,
      );
      await waitFor(() => expect(instance?.getLexicalEditor()).toBeTruthy());
      const onError = vi.spyOn(instance!.getLexicalEditor()!, '_onError');
      await act(async () => {
        expect(insertDescriptionReference(instance!, url, origin)).toBe(true);
        await moment();
      });
      expect(onError.mock.calls).toEqual([]);
      await waitFor(() =>
        expect(view.getByRole('link', { name: /Synthetic accessible PR/ })).toBeTruthy(),
      );
      expect(String(instance!.getDocument('markdown'))).toContain(url);
    });

    it('renders a clickable authorized chip in a read-only editor after JSON reload', async () => {
      let instance: IEditor | undefined;
      const view = render(
        <MinimalTestWrapper
          editable={false}
          plugins={referencePlugins}
          onEditorReady={(editor) => {
            instance = editor;
          }}
        />,
      );
      await waitFor(() => expect(instance?.getLexicalEditor()).toBeTruthy());
      await act(async () => {
        instance!.setDocument('markdown', `[Private stored preview](${url})`);
        normalizeDescriptionReferenceLinks(instance!, origin);
        await moment();
      });
      const json = instance!.getDocument('json');
      expect(JSON.stringify(json)).not.toContain('Private stored preview');
      expect(JSON.stringify(json)).not.toContain('Synthetic accessible PR');
      await act(async () => {
        instance!.setDocument('json', JSON.stringify(json));
        await moment();
      });
      const anchor = view.getByRole('link', { name: /Synthetic accessible PR/ });
      expect(anchor.getAttribute('href')).toBe(url);
      expect(instance!.getLexicalEditor()!.isEditable()).toBe(false);
      expect(view.container.firstElementChild).not.toHaveStyle({ pointerEvents: 'none' });
    });

    it('hides previously cached metadata when the current viewer is denied', async () => {
      referenceLookup.denied = true;
      let instance: IEditor | undefined;
      const view = render(
        <MinimalTestWrapper
          editable={false}
          plugins={referencePlugins}
          onEditorReady={(editor) => {
            instance = editor;
          }}
        />,
      );
      await waitFor(() => expect(instance?.getLexicalEditor()).toBeTruthy());
      await act(async () => {
        instance!.setDocument('markdown', `[Private stored preview](${url})`);
        normalizeDescriptionReferenceLinks(instance!, origin);
        await moment();
      });
      expect(view.queryByText('Synthetic accessible PR')).toBeNull();
      expect(view.getByText('taskDetail.reference.unavailable')).toBeTruthy();
      expect(
        view.getByRole('link', { name: 'taskDetail.reference.unavailable' }).getAttribute('href'),
      ).toBe(url);
    });

    it('sanitizes an adversarial HTML schema node during paste before persistence or toolbar use', async () => {
      let instance: IEditor | undefined;
      const view = render(
        <MinimalTestWrapper
          plugins={referencePlugins}
          onEditorReady={(editor) => {
            instance = editor;
          }}
        />,
      );
      await waitFor(() => expect(instance?.getLexicalEditor()).toBeTruthy());
      const payload = JSON.stringify({
        id: 'gh:github.com:acme:widgets:7',
        kind: 'pull-request',
        url,
      }).replaceAll('"', '&quot;');
      const html = `<a data-schema-link="true" data-schema-type="${DESCRIPTION_REFERENCE_SCHEMA}" data-payload="${payload}" href="javascript:alert(1)">Private HTML title</a>`;
      await act(async () => {
        const lexical = instance!.getLexicalEditor()!;
        lexical.update(() => $getRoot().selectEnd(), { discrete: true });
        lexical.dispatchCommand(PASTE_COMMAND, {
          clipboardData: {
            files: [],
            types: ['text/html'],
            getData: (type: string) => (type === 'text/html' ? html : ''),
          },
          preventDefault: vi.fn(),
          stopImmediatePropagation: vi.fn(),
        } as unknown as ClipboardEvent);
        await moment();
      });
      const json = JSON.stringify(instance!.getDocument('json'));
      expect(json).toContain('schema-link');
      expect(json).not.toContain('javascript:');
      expect(json).not.toContain('Private HTML title');
      expect(view.getByText('taskDetail.reference.unavailable')).toBeTruthy();
      expect(view.queryByRole('link')).toBeNull();
    });
  });

  describe('rendering', () => {
    it('should render editor with real editor instance', async () => {
      const { container } = render(<MinimalTestWrapper />);

      await act(async () => {
        await moment();
      });

      // Editor should be rendered
      expect(container.querySelector('[data-lexical-editor]')).not.toBeNull();
    });

    it('should render with custom placeholder', async () => {
      const placeholder = 'Start typing here...';
      const { container } = render(<MinimalTestWrapper placeholder={placeholder} />);

      await act(async () => {
        await moment();
      });

      expect(container.textContent).toContain(placeholder);
    });

    it('should apply custom styles', async () => {
      const customStyle = { backgroundColor: 'red', paddingTop: 100 };
      const { container } = render(<MinimalTestWrapper style={customStyle} />);

      await act(async () => {
        await moment();
      });

      // Find the Editor component's container
      const editorContainer = container.querySelector('[data-lexical-editor]')?.closest('div');
      // The style should include paddingBottom: 32 (default) merged with custom styles
      expect(editorContainer).toBeTruthy();
    });
  });

  describe('onInit callback', () => {
    it('should call onInit when editor initializes', async () => {
      const onInit = vi.fn();

      render(<MinimalTestWrapper onInit={onInit} />);

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(onInit).toHaveBeenCalled();
      });
    });

    it('should pass editor instance to onInit', async () => {
      const onInit = vi.fn();

      render(<MinimalTestWrapper onInit={onInit} />);

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(onInit).toHaveBeenCalledWith(
          expect.objectContaining({ getDocument: expect.any(Function) }),
        );
      });
    });

    it('should not throw error when initialized with empty content', async () => {
      const onInit = vi.fn();
      let editorInstance: IEditor | undefined;

      // This test ensures the fix for "setEditorState: the editor state is empty" error
      // When editor initializes with empty/undefined content, it should not throw
      const { container } = render(
        <MinimalTestWrapper
          onInit={onInit}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      // Editor should initialize without error
      await waitFor(() => {
        expect(onInit).toHaveBeenCalled();
        expect(editorInstance).toBeDefined();
      });

      // Editor should be rendered
      expect(container.querySelector('[data-lexical-editor]')).not.toBeNull();

      // Getting document should work (returns empty content)
      const text = editorInstance!.getDocument('text') as unknown as string;
      expect(text).toBeDefined();
    });
  });

  describe('onContentChange callback', () => {
    it('should call onContentChange when content changes via setDocument', async () => {
      const onContentChange = vi.fn();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      // Wait for editor to be ready
      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      // Change content using editor API
      await act(async () => {
        editorInstance!.setDocument('text', 'Hello World');
        await moment();
      });

      await waitFor(
        () => {
          expect(onContentChange).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });

    it('should call onContentChange when markdown content is set', async () => {
      const onContentChange = vi.fn();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      // Change content using markdown
      await act(async () => {
        editorInstance!.setDocument('markdown', '# Hello\n\nThis is a paragraph.');
        await moment();
      });

      await waitFor(
        () => {
          expect(onContentChange).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });

    it('should call onContentChange when formatting changes but text stays the same', async () => {
      const onContentChange = vi.fn();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      await act(async () => {
        editorInstance!.setDocument('text', 'Hello');
        await moment();
      });

      onContentChange.mockClear();

      await act(async () => {
        // Keep the same plain text but change formatting structure.
        editorInstance!.setDocument('markdown', '**Hello**');
        await moment();
      });

      await waitFor(
        () => {
          expect(onContentChange).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });

    it('should track multiple content changes', async () => {
      const onContentChange = vi.fn();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      // First change
      await act(async () => {
        editorInstance!.setDocument('text', 'First content');
        await moment();
      });

      // Second change
      await act(async () => {
        editorInstance!.setDocument('text', 'Second content');
        await moment();
      });

      // Third change
      await act(async () => {
        editorInstance!.setDocument('text', 'Third content');
        await moment();
      });

      await waitFor(
        () => {
          // Should have multiple calls for different content changes
          expect(onContentChange.mock.calls.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 2000 },
      );
    });

    it('should not call onContentChange for programmatic hydration while lock is active', async () => {
      const onContentChange = vi.fn();
      const contentChangeLockRef = { current: false };
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          contentChangeLockRef={contentChangeLockRef}
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      await act(async () => {
        editorInstance!.setDocument('text', 'Doc A');
        await moment();
      });

      onContentChange.mockClear();

      contentChangeLockRef.current = true;

      await act(async () => {
        editorInstance!.setDocument('text', 'Doc B');
        await moment();
      });

      expect(onContentChange).not.toHaveBeenCalled();

      contentChangeLockRef.current = false;

      await act(async () => {
        editorInstance!.setDocument('text', 'Doc B edited');
        await moment();
      });

      await waitFor(
        () => {
          expect(onContentChange).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 },
      );
    });
  });

  describe('editor content methods', () => {
    it('should allow getting document as markdown', async () => {
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      await act(async () => {
        editorInstance!.setDocument('text', 'Test content');
        await moment();
      });

      const markdown = editorInstance!.getDocument('markdown') as unknown as string;
      expect(markdown).toContain('Test content');
    });

    it('should allow getting document as JSON', async () => {
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      await act(async () => {
        editorInstance!.setDocument('text', 'Test content');
        await moment();
      });

      const json = editorInstance!.getDocument('json');
      expect(json).toBeDefined();
      expect(typeof json).toBe('object');
    });

    it('should allow getting document as text', async () => {
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      await act(async () => {
        editorInstance!.setDocument('markdown', '# Heading\n\nParagraph');
        await moment();
      });

      const text = editorInstance!.getDocument('text') as unknown as string;
      expect(text).toContain('Heading');
      expect(text).toContain('Paragraph');
    });
  });

  describe('block image caret guard', () => {
    it('is not registered by default (document body keeps stock editor behaviour)', async () => {
      vi.mocked(registerBlockDecoratorCaretGuard).mockClear();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });
      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      expect(registerBlockDecoratorCaretGuard).not.toHaveBeenCalled();
    });

    it('registers the guard for the editor when blockImageCaretGuard is set and unregisters on unmount', async () => {
      vi.mocked(registerBlockDecoratorCaretGuard).mockClear();
      const unregister = vi.fn();
      vi.mocked(registerBlockDecoratorCaretGuard).mockReturnValueOnce(unregister);
      let editorInstance: IEditor | undefined;

      const { unmount } = render(
        <MinimalTestWrapper
          blockImageCaretGuard
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });
      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      expect(registerBlockDecoratorCaretGuard).toHaveBeenCalledWith(editorInstance);

      unmount();
      expect(unregister).toHaveBeenCalled();
    });
  });

  describe('lexical editor access', () => {
    it('should expose getLexicalEditor method', async () => {
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      const lexicalEditor = editorInstance!.getLexicalEditor?.();
      expect(lexicalEditor).toBeDefined();
    });

    it('should allow registering custom update listeners', async () => {
      const updateListener = vi.fn();
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      const lexicalEditor = editorInstance!.getLexicalEditor?.();
      expect(lexicalEditor).toBeDefined();

      if (lexicalEditor) {
        const unregister = lexicalEditor.registerUpdateListener(updateListener);

        // Trigger an update
        await act(async () => {
          editorInstance!.setDocument('text', 'Updated content');
          await moment();
        });

        expect(updateListener).toHaveBeenCalled();

        // Cleanup
        unregister();
      }
    });
  });

  describe('custom plugins', () => {
    it('should accept custom plugins array', async () => {
      const CustomPlugin = () => null;

      const { container } = render(<MinimalTestWrapper plugins={[CustomPlugin]} />);

      await act(async () => {
        await moment();
      });

      // Should render without error
      expect(container.querySelector('[data-lexical-editor]')).not.toBeNull();
    });

    it('should accept extra plugins prepended to base plugins', async () => {
      const ExtraPlugin = () => null;

      // Note: extraPlugins requires base plugins which need toolbar services
      // We test this with minimal plugins instead
      const { container } = render(<MinimalTestWrapper plugins={[ExtraPlugin]} />);

      await act(async () => {
        await moment();
      });

      // Should render without error
      expect(container.querySelector('[data-lexical-editor]')).not.toBeNull();
    });
  });

  describe('window.__editor assignment', () => {
    it('should assign editor to window.__editor for debugging', async () => {
      let editorInstance: IEditor | undefined;

      render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      expect(window.__editor).toBe(editorInstance);
    });

    it('should clear window.__editor on unmount', async () => {
      let editorInstance: IEditor | undefined;

      const { unmount } = render(
        <MinimalTestWrapper
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      expect(window.__editor).toBe(editorInstance);

      unmount();

      expect(window.__editor).toBeUndefined();
    });
  });

  describe('callback stability', () => {
    it('should maintain stable onContentChange behavior across re-renders', async () => {
      const onContentChange = vi.fn();
      let editorInstance: IEditor | undefined;

      const { rerender } = render(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      // Re-render with same props
      rerender(
        <MinimalTestWrapper
          onContentChange={onContentChange}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      // Change content after re-render
      await act(async () => {
        editorInstance!.setDocument('text', 'Content after rerender');
        await moment();
      });

      await waitFor(
        () => {
          expect(onContentChange).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });

    it('should use updated callback when onContentChange prop changes', async () => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      let editorInstance: IEditor | undefined;

      const { rerender } = render(
        <MinimalTestWrapper
          onContentChange={firstCallback}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      await waitFor(() => {
        expect(editorInstance).toBeDefined();
      });

      // Change callback prop
      rerender(
        <MinimalTestWrapper
          onContentChange={secondCallback}
          onEditorReady={(e) => {
            editorInstance = e;
          }}
        />,
      );

      await act(async () => {
        await moment();
      });

      // Trigger content change
      await act(async () => {
        editorInstance!.setDocument('text', 'New content');
        await moment();
      });

      await waitFor(
        () => {
          // Second callback should be called
          expect(secondCallback).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });
  });
});
