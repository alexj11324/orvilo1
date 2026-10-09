# Provider config autosave errors

Provider settings autosave on a 500ms debounce. A rejected write now clears the provider's updating state in the store action and rethrows; the settings form catches it and shows an error toast with the server message (or `providerModels.config.saveFailed`) instead of leaving an unhandled rejection and a provider stuck in its updating state.
