# Clipboard copy result

`copyToClipboard` resolves true when the text reached the clipboard and false when both the async clipboard and the `execCommand` fallback fail; it never throws. The API key dialog toasts the outcome. Other callers ignore the result.
