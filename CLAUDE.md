# CLAUDE

## Comments

A comment resolves an ambiguity the code and its tests cannot, and nothing else earns one.

- If the code already says it, there is no comment.
- A comment that says why something exists is a test instead: one test per reason, each failing when that reason stops holding. The test is the explanation that cannot go stale, and the comment goes.
- No comment cites an issue or a pull request. A reference rots, and read from anywhere other than the repository it was written in, it points nowhere. Why something was decided lives in git.
- What survives is only what no test can carry: a value whose meaning its type does not say, a constraint that lives in another file, a number measured about something outside this code.
