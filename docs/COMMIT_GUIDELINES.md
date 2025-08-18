# Commit Message Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/) specification to ensure consistent, readable commit history and enable automated tooling.

## Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Allowed Types

The project uses `@commitlint/config-conventional` with the following allowed types:

| Type | Description | Examples |
|------|-------------|----------|
| `build` | Changes to build system, dependencies, or dev tools | `build: update webpack to v5` |
| `chore` | Maintenance tasks, no production code changes | `chore: update gitignore` |
| `ci` | Changes to CI/CD configuration files | `ci: add test coverage reporting` |
| `docs` | Documentation changes only | `docs: update API documentation` |
| `feat` | New features | `feat: add user authentication` |
| `fix` | Bug fixes | `fix: resolve login validation error` |
| `perf` | Performance improvements | `perf: optimize database queries` |
| `refactor` | Code changes that neither fix bugs nor add features | `refactor: extract common utility functions` |
| `revert` | Revert a previous commit | `revert: "feat: add user auth"` |
| `style` | Code style changes (formatting, semicolons, etc.) | `style: fix eslint formatting issues` |
| `test` | Adding or modifying tests | `test: add unit tests for auth service` |

## Common Mapping for Non-Standard Prefixes

| ❌ Incorrect | ✅ Correct | Reason |
|-------------|-----------|---------|
| `update: modernize dependencies` | `build: modernize dependencies` | Dependency updates affect build system |
| `remove: delete deprecated code` | `refactor: remove deprecated code` | Code cleanup/restructuring |
| `add: new validation rules` | `feat: add validation rules` | New functionality |
| `improve: optimize performance` | `perf: optimize performance` | Performance enhancement |
| `change: update API response` | `refactor: update API response` | Code modification without new features |

## Examples

### Good Commit Messages
```
feat(auth): add JWT token validation
fix(api): resolve null pointer exception in user service
build: update Jest to latest version
refactor(utils): extract common date formatting functions
docs: add installation instructions to README
ci: add automated security scanning
```

### Poor Commit Messages
```
update: fix things                    # Vague description
remove: stuff                         # Non-standard type, unclear
Fix bug                              # No type, poor capitalization  
feat: Added new feature for users.   # Extra period, inconsistent tense
```

## Validation

The project uses `commitlint` to automatically validate commit messages:

```bash
# Test a commit message
echo "feat: add user authentication" | npx commitlint

# Validate recent commits
npx commitlint --from HEAD~5 --to HEAD
```

## CI/CD Integration

Commit message validation is enforced in the CI/CD pipeline. Commits that don't follow the conventional format will cause the pipeline to fail.

### Fixing Invalid Commit Messages

If you have commits with invalid messages, you can fix them using:

```bash
# For the last commit
git commit --amend -m "fix: correct commit message"

# For multiple commits (interactive rebase)
git rebase -i HEAD~3  # Adjust number as needed
```

## Tools and Configuration

- **Commitlint Config**: `commitlint.config.js`
- **Rules**: Based on `@commitlint/config-conventional`
- **Subject Case**: Disabled (allows any case in subject)

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Commitlint Documentation](https://commitlint.js.org/)
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)