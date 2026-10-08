# Private UI design-sync package

The private UI package exports the repository local UI and ReUI implementations for design-sync tooling. Its build and CSS generation reuse the existing component and token system, with consumer framework dependencies kept external. The export surface is tooling for the documented preview, and does not replace existing product components. Dark preview acceptance remains separate from build validation. Shared dependency resolution pins CodeMirror language 6.12.4 while 6.13.0 references the unavailable streamparser package.
