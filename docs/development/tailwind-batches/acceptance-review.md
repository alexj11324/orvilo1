# Acceptance review presentation

Continues #577 in the feedback drawer, proposal card, confirmation warning and shared verdict metadata. Replaces four antd-style imports with Tailwind classes and existing CSS aliases; review state transitions, disabled/loading behavior, attachments, callbacks, text and DOM remain unchanged.

Feedback entries preserve 20px vertical and 8px horizontal padding, secondary hairlines, last-row border removal, quaternary hover wash and stale inline opacity. Metadata keeps 11/12px sizes, inherited line heights and code-family sequence labels.

Proposals retain the dashed untinted border, legacy large radius, 8px/10px padding and collapsed ellipsis. Annotation numbers retain 16px circles, 10px type, 16px line height and the existing white-on-error treatment. Confirmation warnings retain 10px/14px padding and the exact warning background variable. Shared verdict status fills map to existing semantic aliases; status backgrounds retain legacy variables rather than switching to derived subtle washes.

Decision-bar animation, responsive modal selection and modal shell overrides remain outside this batch. No global cascade change or new token.

Validation: scoped check and selected related tests, font guard, normal hooks and one independent light review. No source-string tests for presentation-only substitutions. 未做真机验证；no Electron visual parity or mobile runtime acceptance claimed.
