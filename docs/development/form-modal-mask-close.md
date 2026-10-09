# Form modal mask close

Settings modals that hold typed input or secrets (create/edit credential, create provider, create model, model config, API key) set `maskClosable: false`. A click outside the dialog no longer discards the form; Escape and the close button still dismiss it. Read-only viewers keep mask-close.
