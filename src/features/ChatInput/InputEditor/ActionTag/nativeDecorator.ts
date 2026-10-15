import { createNativeDecoratorRegistry } from '../nativeDecoratorRegistry';
import type { ActionTagNode } from './ActionTagNode';

const registry = createNativeDecoratorRegistry<ActionTagNode>();
export const registerActionTagDecorator = registry.register;
export const renderActionTagDecorator = registry.render;
