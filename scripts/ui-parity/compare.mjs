// Compare observable effects, with URLs normalized only by explicit entity mappings.
export function compareTransitions(reference, candidate) {
  const reasons = [];
  const actionType = reference.actionType || candidate.actionType || 'click';
  if ((reference.actionType || actionType) !== (candidate.actionType || actionType)) {
    return { verdict: 'different', reasons: ['Configured action types differ.'] };
  }
  for (const [name, run] of Object.entries({ reference, candidate })) {
    const verified =
      actionType === 'reload'
        ? run.actionVerified && run.settled
        : run.hitVerified && run.settled && run.eventVerified;
    if (!verified) {
      return {
        verdict: 'inconclusive',
        reasons: [`${name}: unverified action, hit, event, or settled state`],
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
  if (actionType === 'click' && (!reference.changed || !candidate.changed)) {
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

export function compareSequences(reference, candidate) {
  if (!Array.isArray(reference) || !Array.isArray(candidate)) {
    return { verdict: 'inconclusive', reasons: ['A surface did not produce an action sequence.'] };
  }
  if (reference.length === 0 || candidate.length === 0) {
    return { verdict: 'inconclusive', reasons: ['No action result was recorded.'] };
  }
  if (reference.length !== candidate.length) {
    return {
      verdict: 'inconclusive',
      reasons: [
        `Sequence length differs: reference ${reference.length}, candidate ${candidate.length}.`,
      ],
    };
  }
  const differences = [];
  for (let index = 0; index < reference.length; index++) {
    const result = compareTransitions(reference[index], candidate[index]);
    if (result.verdict === 'inconclusive') {
      return {
        verdict: 'inconclusive',
        reasons: result.reasons.map((reason) => ({ step: index + 1, reason })),
      };
    }
    if (result.verdict === 'different') {
      differences.push(...result.reasons.map((reason) => ({ step: index + 1, reason })));
    }
  }
  if (differences.length) return { verdict: 'different', reasons: differences };
  return {
    verdict: 'observed-match',
    reasons: [],
    limitation:
      'Only the recorded read-only sequence and observable dimensions were compared; this is not full UI parity.',
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
