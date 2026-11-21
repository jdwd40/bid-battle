# Coding standards

Rules the reviewer enforces on every diff. Checks that tooling runs (`npm run lint`, `npm run typecheck`, the tests) are not repeated here.

## Web client

- **One table, two layouts.** The phone and desktop layouts share components, hooks and logic; they differ in composition and CSS. A new behaviour lands once and both layouts use it, so copied markup or event handlers between the phone and desktop trees is a finding.
