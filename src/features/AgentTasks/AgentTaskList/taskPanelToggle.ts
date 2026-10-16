/**
 * Task routes only mount AgentTaskManager on desktop layouts, so mobile must not
 * expose a toggle that changes an invisible panel state.
 */
export const shouldRenderTaskPanelToggle = (isMobile: boolean) => !isMobile;
