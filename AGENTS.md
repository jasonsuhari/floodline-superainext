# Project Agent Instructions

## Frontend Taste Workflow

- For landing pages, portfolios, marketing pages, and visual redesigns, use the installed `design-taste-frontend` skill.
- For Codex/GPT-heavy visual generation where the first output needs stronger art direction, use `gpt-taste`.
- Do not use these skills blindly for dashboards, dense admin tools, data tables, or multi-step product flows. For those, prioritize the existing app design system, information density, accessibility, and task efficiency.
- Before building UI, inspect existing components, styles, tokens, routes, and screenshots when available.
- Avoid generic AI frontend defaults: purple gradients, centered dark mesh heroes, nested cards, three identical feature cards, placeholder copy, backend terminology in user-facing text, and decorative UI that does not support the workflow.
- Every user-facing screen should include clear states for loading, empty, error, and success when relevant.
- After frontend edits, run the app when practical and verify desktop and mobile layout with screenshots or browser inspection. Fix overlapping text, unreadable contrast, broken wrapping, horizontal scroll, and nonfunctional controls before reporting completion.

