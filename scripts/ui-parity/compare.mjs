// Compare observable effects, with URLs normalized only by explicit entity mappings.
export function compareTransitions(reference, candidate) {
  const reasons = [];
  for (const [name, run] of Object.entries({ reference, candidate })) {
    if (!run.hitVerified || !run.settled || !run.eventVerified) {
      return {
        verdict: 'inconclusive',
        reasons: [`${name}: unverified hit, event, or settled state`],
      };
    }
  }
  for (const field of ['route', 'dialogs', 'menus', 'editors', 'selected', 'expanded', 'focus']) {
    if (JSON.stringify(reference.effect[field]) !== JSON.stringify(candidate.effect[field])) {
      reasons.push({
        field,
        reference: reference.effect[field],
        candidate: candidate.effect[field],
      });
    }
  }
  if (reasons.length) return { verdict: 'different', reasons };
  if (!reference.changed || !candidate.changed) {
    return {
      verdict: 'inconclusive',
      reasons: ['No observable transition; an inert control is not proof of parity.'],
    };
  }
  return {
    verdict: 'observed-match',
    reasons: [],
    limitation:
      'Only the recorded action and observable dimensions were compared; this is not full UI parity.',
  };
}

export function transition(before, after) {
  const effect = { route: before.route === after.route ? null : after.route };
  for (const field of ['dialogs', 'menus', 'editors', 'selected', 'expanded']) {
    effect[field] = {
      added: after[field].filter((value) => !before[field].includes(value)),
      removed: before[field].filter((value) => !after[field].includes(value)),
    };
  }
  effect.focus = before.focus === after.focus ? null : after.focus;
  return effect;
}
