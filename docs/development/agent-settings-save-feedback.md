# Agent settings persistence feedback

Agent and team settings retain the current edit when persistence fails and show the localized save-failure notification. Metadata callbacks propagate write rejection to this feedback owner. An older overlapping save cannot overwrite the newer save status or show an obsolete failure. A completed team write remains successful when a subsequent detail refresh fails; refresh errors are logged and do not invite resubmission of a committed change. Existing settings loading surfaces retain their geometry.
