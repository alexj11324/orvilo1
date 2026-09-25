const statuses = [...document.querySelectorAll('span[data-collab-id-alt]')].filter((span) =>
  span.getAttribute('data-collab-id-alt')?.endsWith(':status'),
);

return {
  url: location.href,
  workflowIcons: statuses.map((span) => ({
    task: span.getAttribute('data-collab-id-alt'),
    category: span
      .querySelector('[data-task-workflow-icon]')
      ?.getAttribute('data-task-workflow-icon'),
    executionMenuTrigger: !!span.querySelector('[aria-haspopup="menu"]'),
    svgClass: span.querySelector('svg')?.getAttribute('class'),
  })),
};
