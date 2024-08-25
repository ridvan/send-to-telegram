module.exports = {
    'env': {
        'browser': true,
        'es2021': true,
        'webextensions': true
    },
    'globals': {
        'Sortable': 'readonly'
    },
    'extends': 'eslint:recommended',
    'overrides': [
        {
            'env': {
                'node': true
            },
            'files': [
                '.eslintrc.{js,cjs}'
            ],
            'parserOptions': {
                'sourceType': 'script'
            }
        }
    ],
    'parserOptions': {
        'ecmaVersion': 'latest',
        'sourceType': 'module'
    },
    'rules': {
        'semi': ['error', 'always'],
        'object-curly-spacing': ['error', 'always'],
        'eqeqeq': ['error', 'always'],
        'curly': 'error',
        'quotes': ['error', 'single'],
        'no-trailing-spaces': 'error',
        'no-multi-spaces': 'error',
        'no-multiple-empty-lines': ['error', { 'max': 1 }],
        'no-unused-vars': 'error',
        'no-undef': 'error',
        'space-in-parens': ['error', 'never']
    }
};
