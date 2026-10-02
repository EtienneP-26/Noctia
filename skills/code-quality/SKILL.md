---
name: code-quality
description: How to write, structure and test code the Noctia way (KISS, small modular functions, short docstrings, tests with every change). Use when writing, changing or reviewing code.
---

# Code quality

## Before writing
1. **Check what already exists.** Search the project and the installed dependencies for a function or library that already does the job. Reuse it. Ask the user before adding any new dependency, and say what it saves and what it costs (size, maintenance, license).
2. **Check the style.** Read CONTRIBUTING.md and the linter/formatter config. Match existing naming, layout and patterns.
3. **If the intent is unclear**, restate what you understood and ask for confirmation before coding.

## Shape of the code
- **Small blocks that connect.** Split by responsibility into modules, then functions. Prefer several small files or functions that call each other over one large block.
- **One purpose per function.** Test: can you name it without "and"? A function orchestrates by calling others; it does not parse, validate, compute and save all at once. As a guide, over about 20 lines, look for a split. If it cannot be split, the design needs rethinking.
- **Readable beats efficient.** Pick the clear version. Optimize only with a measurement, and say so.
- **Names explain the code.** Use them instead of comments. Comment only the "why" of something non-obvious.

## Docstrings
Line 1: what the function does, in one line. Then a blank line, then one `:param name:` line per parameter (say the default when there is one), then a `:returns:` line. Nothing else: no essays, no examples inside the docstring.

```python
def web_search(question, region="us-en", timelimit=None):
    """Makes a research on the web using duckduckgo with a question

    :param question: the research question
    :param region: where the region of the search. default us-en
    :param timelimit: Time constraint: d (day), w (week), m (month), y (year). default None
    :returns: the search results, max_results items
    """
```

Other languages: same layout with the language's native tags, for example JSDoc:

```js
/**
 * Makes a research on the web using duckduckgo with a question
 *
 * @param {string} question - the research question
 * @param {string} region - where the region of the search. default us-en
 * @returns {Array} the search results
 */
```

If the project already has its own docstring convention, the project wins.

## Tests
- Every new function or behavior change ships with tests in the same change, in the project's test framework and folder layout.
- Cover the normal case, the edge cases and one failure case.
- If the project has no tests, say so, propose a framework (the simplest one for the stack), and ask before installing it.
- Run the tests and the linter before saying the work is done. Report the result, not an assumption.

## Justify the choices
When you pick between approaches, give the user three short things: why this one, what it brings, and its limits versus the alternative. Example: "I used X because it is built in and needs no dependency. Limit: slower than Y on large inputs, which does not matter at your current size."

## Hard problems
Blocked, or the design is a real trade-off? Delegate to the `architect` agent (Opus). Reading a lot of code or history? Delegate to `reader` (Haiku).

## Before finishing
Run the `security-check` skill if the change touches inputs, auth, data or dependencies.
