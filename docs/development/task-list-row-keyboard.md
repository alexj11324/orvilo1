# Task list row keyboard activation

Task list rows are focusable (`role=button`, `tabIndex=0`) and open on Enter or Space when the row itself has focus, reusing the inbox row handler. Keys from controls inside the row are not intercepted.
