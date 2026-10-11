"""Native identifiers shared by both platform keyboard contract runners."""

FORMS = {
    'setup': ('setup-goal-input', [], ['setup-next-button', 'setup-duration-value']),
    'answer': ('answer-input', ['answer-save-button', 'answer-record-button', 'answer-cancel-button'], []),
    'reflect': ('reflection-input', [], ['reflect-complete-button', 'reflect-return-button']),
    'report': ('content-report-comment', ['content-report-send', 'content-report-cancel'], []),
    'journal': ('journal-search-input', [], []),
}
