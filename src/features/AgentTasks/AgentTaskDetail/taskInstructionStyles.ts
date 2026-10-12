import { type IEditor, useLexicalComposerContext } from '@lobehub/editor';
import { type Klass, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical';
import { useLayoutEffect, useRef } from 'react';

/**
 * The public editor style API disables the heading size multiplier. Its existing
 * heading rules then read these local font variables directly, without trying
 * to outrank the retained vendor selectors. Lexical marks actual text leaves,
 * so their normal heading weight/line boxes need no duplicated editor markup.
 * Explicit user text styles and formatted bold/code keep their own precedence.
 */
export const taskInstructionStyles = {
  content: [
    '[&_h1]:[--lobe-markdown-font-size:var(--text-xl)]',
    '[&_h2]:[--lobe-markdown-font-size:var(--text-base)]',
    '[&_h3]:[--lobe-markdown-font-size:var(--text-base)]',
    '[&_h4]:[--lobe-markdown-font-size:var(--text-base)]',
    '[&_:is(h1,h2,h3,h4)_[data-lexical-text]]:font-semibold',
    '[&_:is(h1,h2,h3,h4)_[data-lexical-decorator]]:font-semibold',
    '[&_h1_[data-lexical-text]]:leading-7',
    '[&_:is(h2,h3,h4)_[data-lexical-text]]:leading-6',
  ].join(' '),
};
type NativePluginKernel = ConstructorParameters<Parameters<IEditor['registerPlugin']>[0]>[0];
type HeadingStyleProperty = 'font-weight' | 'line-height';
type OwnedHeadingStyle = {
  appliedValue: string;
  previousPriority: string;
  previousValue: string;
};
type HeadingPresentation = {
  element: HTMLElement;
  hadStyleAttribute: boolean;
  styles: Partial<Record<HeadingStyleProperty, OwnedHeadingStyle>>;
};
type PresentationController = { start: () => void; stop: () => void };
type PresentationLifecycle = { active: boolean; controllers: Set<PresentationController> };

/**
 * The vendor's heading rule fixes the parent strut at 1.25. Styling text leaves
 * alone misses empty and code-only headings. Use Lexical's public rendering
 * lifecycle to give that parent the task-heading role, without editing nodes or
 * serializing presentation. Author-provided inline styles remain authoritative.
 */
class TaskHeadingPresentationPlugin {
  static pluginName = 'OrviloTaskHeadingPresentation';

  private headingConstructor?: Klass<LexicalNode>;
  private lexicalEditor?: LexicalEditor;
  private presentations = new Map<NodeKey, HeadingPresentation>();
  private unregisterMutation?: () => void;
  private unregisterRoot?: () => void;
  private unregisterTransform?: () => void;
  private controller: PresentationController;

  constructor(
    private kernel: NativePluginKernel,
    private lifecycle: PresentationLifecycle = { active: false, controllers: new Set() },
  ) {
    this.controller = { start: () => this.start(), stop: () => this.stop() };
    lifecycle.controllers.add(this.controller);
    if (lifecycle.active) this.start();
  }

  private restore(key: NodeKey) {
    const presentation = this.presentations.get(key);
    if (!presentation) return;
    for (const property of ['line-height', 'font-weight'] as const) {
      const owned = presentation.styles[property];
      if (!owned) continue;
      const style = presentation.element.style;
      // A later author/native render owns a changed value; never erase it.
      if (
        style.getPropertyValue(property) !== owned.appliedValue ||
        style.getPropertyPriority(property) !== ''
      ) {
        continue;
      }
      if (owned.previousValue) {
        style.setProperty(property, owned.previousValue, owned.previousPriority);
      } else {
        style.removeProperty(property);
      }
    }
    if (!presentation.hadStyleAttribute && presentation.element.style.length === 0) {
      presentation.element.removeAttribute('style');
    }
    this.presentations.delete(key);
  }

  private clearPresentations() {
    this.unregisterMutation?.();
    this.unregisterMutation = undefined;
    for (const key of this.presentations.keys()) this.restore(key);
  }

  private present(key: NodeKey) {
    const element = this.lexicalEditor?.getElementByKey(key);
    const previous = this.presentations.get(key);
    if (previous && previous.element !== element) this.restore(key);
    if (!element || !['H1', 'H2', 'H3', 'H4'].includes(element.tagName)) {
      this.restore(key);
      return;
    }

    const presentation: HeadingPresentation = this.presentations.get(key) ?? {
      element,
      hadStyleAttribute: element.hasAttribute('style'),
      styles: {},
    };
    // These are the existing leading-7/leading-6 roles, including an empty
    // heading's parent strut. Explicitly styled children keep their own metrics.
    const values = {
      'font-weight': 'var(--font-weight-semibold)',
      'line-height':
        element.tagName === 'H1' ? 'calc(var(--spacing) * 7)' : 'calc(var(--spacing) * 6)',
    };
    for (const property of ['line-height', 'font-weight'] as const) {
      const style = element.style;
      const currentValue = style.getPropertyValue(property);
      const currentPriority = style.getPropertyPriority(property);
      let owned = presentation.styles[property];
      if (owned && (currentValue !== owned.appliedValue || currentPriority !== '')) {
        delete presentation.styles[property];
        owned = undefined;
      }
      if (currentValue && !owned) continue;
      owned ??= {
        appliedValue: '',
        previousPriority: currentPriority,
        previousValue: currentValue,
      };
      style.setProperty(property, values[property]);
      owned.appliedValue = style.getPropertyValue(property);
      presentation.styles[property] = owned;
    }
    this.presentations.set(key, presentation);
  }

  private start() {
    if (!this.lexicalEditor) {
      this.unregisterTransform ??= this.kernel.registerNodeTransform((config) => {
        const constructor =
          typeof config === 'function' ? config : (config.withKlass ?? config.replace);
        if (constructor.getType() === 'heading') this.headingConstructor = constructor;
        return config;
      });
      return;
    }
    if (this.unregisterRoot) return;
    // The kernel's public root listener is also safe for headless clones. On
    // reattach, initialization visits every existing heading, not just edits.
    this.unregisterRoot = this.kernel.registerRootListener((root) => {
      this.clearPresentations();
      if (!root || !this.headingConstructor || !this.lexicalEditor) return;
      this.unregisterMutation = this.lexicalEditor.registerMutationListener(
        this.headingConstructor,
        (mutations) => {
          for (const [key, mutation] of mutations) {
            if (mutation === 'destroyed') this.restore(key);
            else this.present(key);
          }
        },
        { skipInitialization: false },
      );
    });
  }

  private stop() {
    this.unregisterRoot?.();
    this.unregisterRoot = undefined;
    this.clearPresentations();
    this.unregisterTransform?.();
    this.unregisterTransform = undefined;
  }

  onInit(editor: LexicalEditor) {
    this.lexicalEditor = editor;
    this.unregisterTransform?.();
    this.unregisterTransform = undefined;
    if (this.lifecycle.active) this.start();
  }

  destroy() {
    this.stop();
    this.lifecycle.controllers.delete(this.controller);
  }
}

function TaskInstructionHeadingPresentation() {
  const [editor] = useLexicalComposerContext();
  const lifecycleRef = useRef<PresentationLifecycle>({ active: false, controllers: new Set() });

  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.active = true;
    editor.registerPlugin(TaskHeadingPresentationPlugin, lifecycle);
    for (const controller of lifecycle.controllers) controller.start();
    return () => {
      lifecycle.active = false;
      for (const controller of lifecycle.controllers) controller.stop();
    };
  }, [editor]);

  return null;
}

export const TASK_INSTRUCTION_EDITOR_PLUGINS = [TaskInstructionHeadingPresentation];
