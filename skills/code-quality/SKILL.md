---
name: code-quality
description: How to write, structure and test code the Noctia way (KISS, small modular functions, markdown docstrings, tests with every change). Use when writing, changing or reviewing code.
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
1. **The project wins.** If the code already has a docstring convention (or CONTRIBUTING.md / a linter config sets one), follow it, unless the user asks for the Noctia style.
2. **Otherwise, or if the user asks, use the Noctia style:** markdown inside the docstring. Line 1 is a `#` title saying what the function does. Then `## Args`, `## Returns`, `## Raises` (only if it raises) and `## Example` (a runnable one, doctest-style when the language supports it). Keep each section short.
3. **Other languages follow the same style**, even if not listed here: the same sections in the same order, written with the language's native doc-comment syntax.

Python:

```python
def blend(
    src: tuple[int, int, int, int],
    dst: tuple[int, int, int, int]
) -> tuple[int, int, int, int]:
    """# Blend two pixels together using alpha compositing

    ## Args:
        src: Upper pixel as (r, g, b, a).
        dst: Lower pixel as (r, g, b, a).

    ## Returns:
        The blended pixel, always fully opaque.

    ## Raises:
        ValueError: If a channel is outside 0-255.

    ## Example:
        >>> blend((255, 0, 0, 128), (0, 0, 255, 255))
        (128, 0, 127, 255)
    """
    a = src[3]
    inv = 255 - a
    rgb = tuple((s * a + d * inv) // 255 for s, d in zip(src[:3], dst[:3]))

    return (*rgb, 255)
```

Rust:

```rust
/// # Blends two pixels together using alpha compositing.
///
/// ## Arguments
/// * `src` - Upper pixel as `[r, g, b, a]`
/// * `dst` - Lower pixel as `[r, g, b, a]`
///
/// ## Returns
/// The blended pixel, always fully opaque.
///
/// ## Examples
/// ```
/// let red = [255, 0, 0, 255];
/// let blue = [0, 0, 255, 255];
/// assert_eq!(blend(red, blue), [255, 0, 0, 255]);
///
/// let half_red = [255, 0, 0, 128];
/// assert_eq!(blend(half_red, blue), [128, 0, 127, 255]);
/// ```
pub fn blend(src: [u8; 4], dst: [u8; 4]) -> [u8; 4] {
    let a = src[3] as u16;
    let inv = 255 - a;
    let mix = |s: u8, d: u8| ((s as u16 * a + d as u16 * inv) / 255) as u8;

    [mix(src[0], dst[0]), mix(src[1], dst[1]), mix(src[2], dst[2]), 255]
}
```

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
