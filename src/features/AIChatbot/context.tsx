'use client';

import { createContext, use } from 'react';

/** The official Chatbot page supplies presentation; existing stores own its behavior. */
export const ChatbotSurfaceContext = createContext(false);
export const useChatbotSurface = () => use(ChatbotSurfaceContext);
