module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'perf', 'ci', 'build', 'revert']],
    'scope-empty': [2, 'always'],
    'subject-empty': [2, 'never']
  }
};
